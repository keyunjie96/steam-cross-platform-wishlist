/**
 * Steam Cross-Platform Wishlist - HLTB Content Script
 *
 * This content script runs on howlongtobeat.com pages.
 * It injects the page script and relays messages between the service worker
 * and the page script to enable same-origin API calls.
 */

const LOG_PREFIX = '[XCPW HLTB Content]';
const DEBUG = false;

interface HltbQueryRequest {
  type: 'HLTB_QUERY';
  requestId: string;
  gameName: string;
  steamAppId?: string;
}

interface HltbQueryResponse {
  type: 'HLTB_QUERY_RESPONSE';
  requestId: string;
  success: boolean;
  data?: {
    hltbId: number;
    gameName: string;
    mainStory: number;
    mainExtra: number;
    completionist: number;
    allStyles: number;
    steamId: number | null;
  } | null;
  error?: string;
}

// Track pending requests
const pendingRequests = new Map<string, (response: HltbQueryResponse) => void>();

// Inject the page script
function injectPageScript(): Promise<void> {
  return new Promise((resolve) => {
    // Check if already injected
    if (document.querySelector('script[data-xcpw-hltb]')) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/hltbPageScript.js');
    script.setAttribute('data-xcpw-hltb', 'true');
    script.onload = () => {
      if (DEBUG) console.log(`${LOG_PREFIX} Page script injected`);
      resolve();
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

// Listen for responses from page script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const data = event.data;
  if (data?.type === 'XCPW_HLTB_RESPONSE') {
    if (DEBUG) console.log(`${LOG_PREFIX} Received response:`, data);
    const resolver = pendingRequests.get(data.requestId);
    if (resolver) {
      pendingRequests.delete(data.requestId);
      resolver({
        type: 'HLTB_QUERY_RESPONSE',
        requestId: data.requestId,
        success: data.success,
        data: data.data,
        error: data.error
      });
    }
  } else if (data?.type === 'XCPW_HLTB_READY') {
    if (DEBUG) console.log(`${LOG_PREFIX} Page script ready`);
  }
});

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message: HltbQueryRequest, _sender, sendResponse) => {
  if (message.type !== 'HLTB_QUERY') return false;

  if (DEBUG) console.log(`${LOG_PREFIX} Received query:`, message);

  // Inject script if needed, then forward request
  injectPageScript().then(() => {
    // Store resolver
    pendingRequests.set(message.requestId, sendResponse);

    // Forward to page script
    window.postMessage({
      type: 'XCPW_HLTB_REQUEST',
      requestId: message.requestId,
      gameName: message.gameName,
      steamAppId: message.steamAppId
    }, '*');

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingRequests.has(message.requestId)) {
        pendingRequests.delete(message.requestId);
        sendResponse({
          type: 'HLTB_QUERY_RESPONSE',
          requestId: message.requestId,
          success: false,
          error: 'Request timed out'
        });
      }
    }, 10000);
  });

  // Return true to indicate async response
  return true;
});

// Inject script on load
injectPageScript();

if (DEBUG) console.log(`${LOG_PREFIX} Content script loaded on`, window.location.href);
