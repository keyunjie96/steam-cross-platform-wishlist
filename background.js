/**
 * Steam Cross-Platform Wishlist - Background Service Worker
 *
 * Handles messaging between content scripts and manages the platform data resolution.
 * Runs as a service worker in MV3 - can be terminated at any time by Chrome.
 *
 * Stage 2: Integrates with IGDB for platform availability data.
 */

// Import dependencies (must be at top level for service worker)
importScripts('types.js', 'cache.js', 'tokenManager.js', 'igdbClient.js', 'resolver.js');

const LOG_PREFIX = '[XCPW Background]';

/**
 * Handles incoming messages from content scripts and options page
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

    case 'SAVE_CREDENTIALS':
      handleSaveCredentials(message, sendResponse);
      return true; // Async response

    case 'TEST_CONNECTION':
      handleTestConnection(sendResponse);
      return true; // Async response

    case 'CLEAR_CREDENTIALS':
      handleClearCredentials(sendResponse);
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
 * Uses the resolver to get platform data from IGDB or cache
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

    // Use the resolver to get platform data
    const { entry, fromCache } = await globalThis.XCPW_Resolver.resolvePlatformData(appid, gameName);

    console.log(`${LOG_PREFIX} ${fromCache ? 'Cache hit' : 'Resolved'} for appid ${appid} (source: ${entry.source || 'unknown'})`);

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

    // Force refresh from IGDB
    await globalThis.XCPW_Resolver.forceRefresh(appid, gameName);

    console.log(`${LOG_PREFIX} Cache updated for appid ${appid}`);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error handling UPDATE_CACHE:`, error);
    sendResponse({ success: false });
  }
}

/**
 * Handles SAVE_CREDENTIALS request from options page
 * @param {import('./types.js').SaveCredentialsRequest} message
 * @param {(response: {success: boolean, error?: string}) => void} sendResponse
 */
async function handleSaveCredentials(message, sendResponse) {
  try {
    const { clientId, clientSecret } = message;

    if (!clientId || !clientSecret) {
      sendResponse({ success: false, error: 'Client ID and Secret are required' });
      return;
    }

    await globalThis.XCPW_TokenManager.saveCredentials(clientId, clientSecret);
    console.log(`${LOG_PREFIX} Credentials saved`);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error saving credentials:`, error);
    sendResponse({ success: false, error: 'Failed to save credentials' });
  }
}

/**
 * Handles TEST_CONNECTION request from options page
 * @param {(response: {success: boolean, message: string}) => void} sendResponse
 */
async function handleTestConnection(sendResponse) {
  try {
    // First test token acquisition
    const tokenResult = await globalThis.XCPW_TokenManager.testConnection();

    if (!tokenResult.success) {
      sendResponse(tokenResult);
      return;
    }

    // Then test IGDB connection
    const token = await globalThis.XCPW_TokenManager.getValidToken();
    if (!token) {
      sendResponse({ success: false, message: 'Failed to get access token' });
      return;
    }

    const igdbResult = await globalThis.XCPW_IGDBClient.testConnection(token.accessToken, token.clientId);
    sendResponse(igdbResult);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error testing connection:`, error);
    sendResponse({ success: false, message: 'Connection test failed' });
  }
}

/**
 * Handles CLEAR_CREDENTIALS request from options page
 * @param {(response: {success: boolean}) => void} sendResponse
 */
async function handleClearCredentials(sendResponse) {
  try {
    await globalThis.XCPW_TokenManager.clearCredentials();
    console.log(`${LOG_PREFIX} Credentials cleared`);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error clearing credentials:`, error);
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
    console.error(`${LOG_PREFIX} Error getting cache stats:`, error);
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
    console.log(`${LOG_PREFIX} Cache cleared`);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error clearing cache:`, error);
    sendResponse({ success: false });
  }
}

// Register message listener at top level (required for service worker)
chrome.runtime.onMessage.addListener(handleMessage);

// Log when service worker starts
console.log(`${LOG_PREFIX} Service worker initialized (Stage 2 with IGDB integration)`);

// Log when service worker is about to be suspended (useful for debugging)
self.addEventListener('activate', () => {
  console.log(`${LOG_PREFIX} Service worker activated`);
});
