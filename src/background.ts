/**
 * Steam Cross-Platform Wishlist - Background Service Worker
 *
 * Handles messaging between content scripts and manages the platform data resolution.
 * Runs as a service worker in MV3 - can be terminated at any time by Chrome.
 *
 * Uses Wikidata as data source (no auth required).
 */

// Import dependencies via importScripts (Chrome extension service workers)
// TypeScript will handle the types through the global declarations
declare function importScripts(...urls: string[]): void;
importScripts('types.js', 'cache.js', 'wikidataClient.js', 'resolver.js');

import type {
  ExtensionMessage,
  GetPlatformDataRequest,
  GetPlatformDataResponse,
  GetPlatformDataBatchRequest,
  GetPlatformDataBatchResponse,
  UpdateCacheRequest,
  CacheEntry
} from './types';

const LOG_PREFIX = '[XCPW Background]';

interface AsyncResponse {
  success: boolean;
  data?: CacheEntry | null;
  fromCache?: boolean;
  error?: string;
  count?: number;
  oldestEntry?: number | null;
  results?: Record<string, { data: CacheEntry; fromCache: boolean }>;
}

/**
 * Wraps an async handler with error handling and sends the response
 */
async function handleAsync(
  handler: () => Promise<AsyncResponse>,
  sendResponse: (response: AsyncResponse) => void,
  errorResponse: AsyncResponse
): Promise<void> {
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
 */
function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: AsyncResponse) => void
): boolean {
  if (!message?.type) {
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }

  const errorResponse: AsyncResponse = { success: false, data: null, fromCache: false };

  switch (message.type) {
    case 'GET_PLATFORM_DATA':
      handleAsync(() => getPlatformData(message), sendResponse, errorResponse);
      return true;

    case 'GET_PLATFORM_DATA_BATCH':
      handleAsync(() => getBatchPlatformData(message), sendResponse, { success: false, results: {} });
      return true;

    case 'UPDATE_CACHE':
      handleAsync(() => updateCache(message), sendResponse, { success: false });
      return true;

    case 'GET_CACHE_STATS':
      handleAsync(() => handleGetCacheStats(), sendResponse, { success: false });
      return true;

    case 'CLEAR_CACHE':
      handleAsync(() => handleClearCache(), sendResponse, { success: false });
      return true;

    default:
      sendResponse({ success: false, error: `Unknown message type: ${(message as { type: string }).type}` });
      return false;
  }
}

/**
 * Gets platform data for a game from cache or Wikidata
 */
async function getPlatformData(message: GetPlatformDataRequest): Promise<GetPlatformDataResponse> {
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
 * Gets platform data for multiple games in batch from cache or Wikidata
 */
async function getBatchPlatformData(message: GetPlatformDataBatchRequest): Promise<GetPlatformDataBatchResponse> {
  const { games } = message;

  if (!games || !Array.isArray(games) || games.length === 0) {
    return { success: false, results: {} };
  }

  if (!globalThis.XCPW_Resolver) {
    return { success: false, results: {}, error: 'Resolver not loaded' };
  }

  console.log(`${LOG_PREFIX} Batch request for ${games.length} games`);

  const resultsMap = await globalThis.XCPW_Resolver.batchResolvePlatformData(games);

  // Convert Map to plain object for message passing
  const results: Record<string, { data: CacheEntry; fromCache: boolean }> = {};
  let cachedCount = 0;
  let resolvedCount = 0;

  for (const [appid, { entry, fromCache }] of resultsMap) {
    results[appid] = { data: entry, fromCache };
    if (fromCache) {
      cachedCount++;
    } else {
      resolvedCount++;
    }
  }

  console.log(`${LOG_PREFIX} Batch complete: ${cachedCount} cached, ${resolvedCount} resolved`);

  return { success: true, results };
}

/**
 * Forces a cache refresh for a game
 */
async function updateCache(message: UpdateCacheRequest): Promise<{ success: boolean }> {
  const { appid, gameName } = message;

  if (!appid || !gameName) {
    return { success: false };
  }

  await globalThis.XCPW_Resolver.forceRefresh(appid, gameName);
  console.log(`${LOG_PREFIX} Cache updated for appid ${appid}`);

  return { success: true };
}

/**
 * Gets cache statistics (handler wrapper to avoid name collision with cache.js)
 */
async function handleGetCacheStats(): Promise<{ success: boolean; count: number; oldestEntry: number | null }> {
  const stats = await globalThis.XCPW_Cache.getCacheStats();
  return { success: true, count: stats.count, oldestEntry: stats.oldestEntry };
}

/**
 * Clears all cached data (handler wrapper to avoid name collision with cache.js)
 */
async function handleClearCache(): Promise<{ success: boolean }> {
  await globalThis.XCPW_Cache.clearCache();
  console.log(`${LOG_PREFIX} Cache cleared`);
  return { success: true };
}

chrome.runtime.onMessage.addListener(handleMessage);
console.log(`${LOG_PREFIX} Service worker initialized`);
