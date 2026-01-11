/**
 * Steam Cross-Platform Wishlist - Background Service Worker
 *
 * Handles messaging between content scripts and manages the platform data cache.
 * Runs as a service worker in MV3 - can be terminated at any time by Chrome.
 */

// Import dependencies (must be at top level for service worker)
importScripts('types.js', 'cache.js');

const LOG_PREFIX = '[XCPW Background]';

/**
 * Handles incoming messages from content scripts
 * @param {import('./types.js').ExtensionMessage} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response: any) => void} sendResponse
 * @returns {boolean} - Return true to indicate async response
 */
function handleMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }

  switch (message.type) {
    case 'GET_PLATFORM_DATA':
      handleGetPlatformData(message, sendResponse);
      return true; // Async response

    case 'UPDATE_CACHE':
      handleUpdateCache(message, sendResponse);
      return true; // Async response

    default:
      sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      return false;
  }
}

/**
 * Handles GET_PLATFORM_DATA request
 * @param {import('./types.js').GetPlatformDataRequest} message
 * @param {(response: import('./types.js').GetPlatformDataResponse) => void} sendResponse
 */
async function handleGetPlatformData(message, sendResponse) {
  try {
    const { appid, gameName } = message;

    if (!appid || !gameName) {
      sendResponse({ success: false, data: null, fromCache: false });
      return;
    }

    const { entry, fromCache } = await globalThis.XCPW_Cache.getOrCreatePlatformData(appid, gameName);

    console.log(`${LOG_PREFIX} ${fromCache ? 'Cache hit' : 'Cache miss'} for appid ${appid}`);

    sendResponse({
      success: true,
      data: entry,
      fromCache
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error handling GET_PLATFORM_DATA:`, error);
    sendResponse({ success: false, data: null, fromCache: false });
  }
}

/**
 * Handles UPDATE_CACHE request (for future use when we have real data sources)
 * @param {import('./types.js').UpdateCacheRequest} message
 * @param {(response: {success: boolean}) => void} sendResponse
 */
async function handleUpdateCache(message, sendResponse) {
  try {
    const { appid, gameName } = message;

    if (!appid || !gameName) {
      sendResponse({ success: false });
      return;
    }

    // For now, just ensure there's a cache entry
    await globalThis.XCPW_Cache.getOrCreatePlatformData(appid, gameName);

    console.log(`${LOG_PREFIX} Cache updated for appid ${appid}`);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error handling UPDATE_CACHE:`, error);
    sendResponse({ success: false });
  }
}

// Register message listener at top level (required for service worker)
chrome.runtime.onMessage.addListener(handleMessage);

// Log when service worker starts
console.log(`${LOG_PREFIX} Service worker initialized`);

// Log when service worker is about to be suspended (useful for debugging)
self.addEventListener('activate', () => {
  console.log(`${LOG_PREFIX} Service worker activated`);
});
