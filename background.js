/**
 * Steam Cross-Platform Wishlist - Background Service Worker
 *
 * Handles messaging between content scripts and manages the platform data resolution.
 * Runs as a service worker in MV3 - can be terminated at any time by Chrome.
 *
 * Uses Wikidata as data source (no auth required).
 */

// Import dependencies
try {
  importScripts('types.js', 'cache.js', 'wikidataClient.js', 'resolver.js');
} catch (error) {
  console.error('[XCPW Background] Failed to load dependencies:', error);
}

const BG_LOG_PREFIX = '[XCPW Background]';
const BG_DEBUG = false; // Set to true for verbose debugging

/**
 * Handles incoming messages from content scripts and options page
 * @param {import('./types.js').ExtensionMessage} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response: any) => void} sendResponse
 * @returns {boolean} - Return true to indicate async response
 */
function handleMessage(message, sender, sendResponse) {
  if (BG_DEBUG) console.log(`${BG_LOG_PREFIX} Received message:`, message?.type, message?.appid);

  if (!message || !message.type) {
    console.error(`${BG_LOG_PREFIX} Invalid message format:`, message);
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }

  switch (message.type) {
    case 'GET_PLATFORM_DATA':
      if (BG_DEBUG) console.log(`${BG_LOG_PREFIX} Handling GET_PLATFORM_DATA for appid ${message.appid}`);
      handleGetPlatformData(message, sendResponse);
      return true; // Async response

    case 'UPDATE_CACHE':
      handleUpdateCache(message, sendResponse);
      return true; // Async response

    case 'GET_CACHE_STATS':
      handleGetCacheStats(sendResponse);
      return true; // Async response

    case 'CLEAR_CACHE':
      handleClearCache(sendResponse);
      return true; // Async response

    default:
      sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      return false;
  }
}

/**
 * Handles GET_PLATFORM_DATA request
 * Uses the resolver to get platform data from Wikidata or cache
 * @param {import('./types.js').GetPlatformDataRequest} message
 * @param {(response: import('./types.js').GetPlatformDataResponse) => void} sendResponse
 */
async function handleGetPlatformData(message, sendResponse) {
  try {
    const { appid, gameName } = message;

    if (!appid || !gameName) {
      console.error(`${BG_LOG_PREFIX} Missing appid or gameName:`, { appid, gameName });
      sendResponse({ success: false, data: null, fromCache: false });
      return;
    }

    if (BG_DEBUG) console.log(`${BG_LOG_PREFIX} Calling resolver for appid ${appid} (${gameName})`);

    // Check if resolver is available
    if (!globalThis.XCPW_Resolver) {
      console.error(`${BG_LOG_PREFIX} CRITICAL: XCPW_Resolver not available!`);
      sendResponse({ success: false, data: null, fromCache: false, error: 'Resolver not loaded' });
      return;
    }

    // Use the resolver to get platform data
    const { entry, fromCache } = await globalThis.XCPW_Resolver.resolvePlatformData(appid, gameName);

    if (BG_DEBUG) console.log(`${BG_LOG_PREFIX} Resolver returned:`, { source: entry.source, fromCache, platforms: entry.platforms });

    console.log(`${BG_LOG_PREFIX} ${fromCache ? 'Cache hit' : 'Resolved'} for appid ${appid} (source: ${entry.source || 'unknown'})`);

    sendResponse({
      success: true,
      data: entry,
      fromCache
    });
  } catch (error) {
    console.error(`${BG_LOG_PREFIX} Error handling GET_PLATFORM_DATA:`, error);
    console.error(`${BG_LOG_PREFIX} Error stack:`, error.stack);
    sendResponse({ success: false, data: null, fromCache: false, error: error.message });
  }
}

/**
 * Handles UPDATE_CACHE request (for force refresh)
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

    // Force refresh from Wikidata
    await globalThis.XCPW_Resolver.forceRefresh(appid, gameName);

    console.log(`${BG_LOG_PREFIX} Cache updated for appid ${appid}`);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${BG_LOG_PREFIX} Error handling UPDATE_CACHE:`, error);
    sendResponse({ success: false });
  }
}

/**
 * Handles GET_CACHE_STATS request from options page
 * @param {(response: {success: boolean, count?: number, oldestEntry?: number}) => void} sendResponse
 */
async function handleGetCacheStats(sendResponse) {
  try {
    const stats = await globalThis.XCPW_Cache.getCacheStats();
    sendResponse({
      success: true,
      count: stats.count,
      oldestEntry: stats.oldestEntry
    });
  } catch (error) {
    console.error(`${BG_LOG_PREFIX} Error getting cache stats:`, error);
    sendResponse({ success: false });
  }
}

/**
 * Handles CLEAR_CACHE request from options page
 * @param {(response: {success: boolean}) => void} sendResponse
 */
async function handleClearCache(sendResponse) {
  try {
    await globalThis.XCPW_Cache.clearCache();
    console.log(`${BG_LOG_PREFIX} Cache cleared`);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${BG_LOG_PREFIX} Error clearing cache:`, error);
    sendResponse({ success: false });
  }
}

// Register message listener at top level (required for service worker)
chrome.runtime.onMessage.addListener(handleMessage);

// Log when service worker starts
console.log(`${BG_LOG_PREFIX} Service worker initialized (Wikidata)`);

// Log when service worker is about to be suspended (useful for debugging)
self.addEventListener('activate', () => {
  console.log(`${BG_LOG_PREFIX} Service worker activated`);
});
