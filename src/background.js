/**
 * Steam Cross-Platform Wishlist - Background Service Worker
 *
 * Handles messaging between content scripts and manages the platform data resolution.
 * Runs as a service worker in MV3 - can be terminated at any time by Chrome.
 *
 * Uses Wikidata as data source (no auth required).
 */

importScripts('types.js', 'cache.js', 'wikidataClient.js', 'resolver.js');

const LOG_PREFIX = '[XCPW Background]';

/**
 * Wraps an async handler with error handling and sends the response
 * @param {() => Promise<Object>} handler
 * @param {(response: Object) => void} sendResponse
 * @param {Object} errorResponse - Default response on error
 */
async function handleAsync(handler, sendResponse, errorResponse) {
  try {
    const result = await handler();
    sendResponse(result);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    sendResponse(errorResponse);
  }
}

/**
 * Handles incoming messages from content scripts and options page
 * @param {import('./types.js').ExtensionMessage} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(response: Object) => void} sendResponse
 * @returns {boolean} - Return true to indicate async response
 */
function handleMessage(message, _sender, sendResponse) {
  if (!message?.type) {
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }

  const errorResponse = { success: false, data: null, fromCache: false };

  switch (message.type) {
    case 'GET_PLATFORM_DATA':
      handleAsync(() => getPlatformData(message), sendResponse, errorResponse);
      return true;

    case 'UPDATE_CACHE':
      handleAsync(() => updateCache(message), sendResponse, { success: false });
      return true;

    case 'GET_CACHE_STATS':
      handleAsync(() => getCacheStats(), sendResponse, { success: false });
      return true;

    case 'CLEAR_CACHE':
      handleAsync(() => clearCache(), sendResponse, { success: false });
      return true;

    default:
      sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      return false;
  }
}

/**
 * Gets platform data for a game from cache or Wikidata
 * @param {import('./types.js').GetPlatformDataRequest} message
 * @returns {Promise<import('./types.js').GetPlatformDataResponse>}
 */
async function getPlatformData(message) {
  const { appid, gameName } = message;

  if (!appid || !gameName) {
    return { success: false, data: null, fromCache: false };
  }

  if (!globalThis.XCPW_Resolver) {
    return { success: false, data: null, fromCache: false, error: 'Resolver not loaded' };
  }

  const { entry, fromCache } = await globalThis.XCPW_Resolver.resolvePlatformData(appid, gameName);
  console.log(`${LOG_PREFIX} ${fromCache ? 'Cache hit' : 'Resolved'} for appid ${appid} (source: ${entry.source || 'unknown'})`);

  return { success: true, data: entry, fromCache };
}

/**
 * Forces a cache refresh for a game
 * @param {import('./types.js').UpdateCacheRequest} message
 * @returns {Promise<{success: boolean}>}
 */
async function updateCache(message) {
  const { appid, gameName } = message;

  if (!appid || !gameName) {
    return { success: false };
  }

  await globalThis.XCPW_Resolver.forceRefresh(appid, gameName);
  console.log(`${LOG_PREFIX} Cache updated for appid ${appid}`);

  return { success: true };
}

/**
 * Gets cache statistics
 * @returns {Promise<{success: boolean, count: number, oldestEntry: number | null}>}
 */
async function getCacheStats() {
  const stats = await globalThis.XCPW_Cache.getCacheStats();
  return { success: true, count: stats.count, oldestEntry: stats.oldestEntry };
}

/**
 * Clears all cached data
 * @returns {Promise<{success: boolean}>}
 */
async function clearCache() {
  await globalThis.XCPW_Cache.clearCache();
  console.log(`${LOG_PREFIX} Cache cleared`);
  return { success: true };
}

chrome.runtime.onMessage.addListener(handleMessage);
console.log(`${LOG_PREFIX} Service worker initialized`);
