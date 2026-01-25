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
importScripts('types.js', 'cache.js', 'wikidataClient.js', 'hltbClient.js', 'resolver.js');

import type {
  ExtensionMessage,
  GetPlatformDataRequest,
  GetPlatformDataResponse,
  GetPlatformDataBatchRequest,
  GetPlatformDataBatchResponse,
  UpdateCacheRequest,
  CacheEntry,
  HltbData,
  GetHltbDataRequest,
  GetHltbDataResponse,
  GetHltbDataBatchRequest,
  GetHltbDataBatchResponse
} from './types';

const LOG_PREFIX = '[SCPW Background]';

// Sentinel value for "searched HLTB but no match found" - prevents repeated searches
const HLTB_NOT_FOUND_ID = -1;

/**
 * Creates a "not found" marker for HLTB data to prevent repeated searches.
 */
function createHltbNotFoundMarker(): HltbData {
  return {
    hltbId: HLTB_NOT_FOUND_ID,
    mainStory: 0,
    mainExtra: 0,
    completionist: 0,
    allStyles: 0,
    steamId: null
  };
}

interface AsyncResponse {
  success: boolean;
  data?: CacheEntry | HltbData | null;
  fromCache?: boolean;
  error?: string;
  count?: number;
  oldestEntry?: number | null;
  results?: Record<string, { data: CacheEntry; fromCache: boolean }>;
  hltbResults?: Record<string, HltbData | null>;
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

    case 'GET_HLTB_DATA':
      handleAsync(() => getHltbData(message as GetHltbDataRequest), sendResponse, { success: false, data: null });
      return true;

    case 'GET_HLTB_DATA_BATCH':
      handleAsync(() => getBatchHltbData(message as GetHltbDataBatchRequest), sendResponse, { success: false, hltbResults: {} });
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

  if (!globalThis.SCPW_Resolver) {
    return { success: false, data: null, fromCache: false, error: 'Resolver not loaded' };
  }

  const { entry, fromCache } = await globalThis.SCPW_Resolver.resolvePlatformData(appid, gameName);
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

  if (!globalThis.SCPW_Resolver) {
    return { success: false, results: {}, error: 'Resolver not loaded' };
  }

  console.log(`${LOG_PREFIX} Batch request for ${games.length} games`);

  const resultsMap = await globalThis.SCPW_Resolver.batchResolvePlatformData(games);

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

  await globalThis.SCPW_Resolver.forceRefresh(appid, gameName);
  console.log(`${LOG_PREFIX} Cache updated for appid ${appid}`);

  return { success: true };
}

/**
 * Gets cache statistics (handler wrapper to avoid name collision with cache.js)
 */
async function handleGetCacheStats(): Promise<{ success: boolean; count: number; oldestEntry: number | null }> {
  const stats = await globalThis.SCPW_Cache.getCacheStats();
  return { success: true, count: stats.count, oldestEntry: stats.oldestEntry };
}

/**
 * Clears all cached data (handler wrapper to avoid name collision with cache.js)
 */
async function handleClearCache(): Promise<{ success: boolean }> {
  await globalThis.SCPW_Cache.clearCache();
  console.log(`${LOG_PREFIX} Cache cleared`);
  return { success: true };
}

/**
 * Gets HLTB data for a single game
 */
async function getHltbData(message: GetHltbDataRequest): Promise<GetHltbDataResponse> {
  const { appid, gameName } = message;

  if (!appid || !gameName) {
    return { success: false, data: null, error: 'Missing appid or gameName' };
  }

  if (!globalThis.SCPW_HltbClient) {
    return { success: false, data: null, error: 'HLTB client not loaded' };
  }

  // Check if we have cached HLTB data first
  const cached = await globalThis.SCPW_Cache.getFromCache(appid);
  const hltb = cached?.hltbData;

  // Check for "not found" marker - don't re-search
  if (hltb && hltb.hltbId === HLTB_NOT_FOUND_ID) {
    console.log(`${LOG_PREFIX} HLTB cache hit (not found) for appid ${appid}`);
    return { success: true, data: null };
  }

  // Check for valid cached data (require valid hltbId for clickable badges)
  if (hltb && hltb.hltbId > 0 && (hltb.mainStory > 0 || hltb.mainExtra > 0 || hltb.completionist > 0)) {
    console.log(`${LOG_PREFIX} HLTB cache hit for appid ${appid} (hltbId=${hltb.hltbId})`);
    return { success: true, data: hltb };
  }

  // Query HLTB
  try {
    console.log(`${LOG_PREFIX} HLTB querying for "${gameName}" (appid: ${appid})`);
    const result = await globalThis.SCPW_HltbClient.queryByGameName(gameName, appid);
    console.log(`${LOG_PREFIX} HLTB query result for ${appid}:`, JSON.stringify(result));

    if (result) {
      // Update cache with HLTB data
      if (cached) {
        cached.hltbData = result.data;
        await globalThis.SCPW_Cache.saveToCache(cached);
      }
      console.log(`${LOG_PREFIX} HLTB resolved for appid ${appid}: ${result.data.mainStory}h`);
      return { success: true, data: result.data };
    }

    // Save "not found" marker to cache to prevent repeated searches
    if (cached) {
      cached.hltbData = createHltbNotFoundMarker();
      await globalThis.SCPW_Cache.saveToCache(cached);
    }
    console.log(`${LOG_PREFIX} HLTB no match for appid ${appid} (cached as not found)`);
    return { success: true, data: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG_PREFIX} HLTB error for ${appid}:`, errorMessage);
    return { success: false, data: null, error: errorMessage };
  }
}

/**
 * Gets HLTB data for multiple games in batch
 */
async function getBatchHltbData(message: GetHltbDataBatchRequest): Promise<AsyncResponse> {
  const { games } = message;

  if (!games || !Array.isArray(games) || games.length === 0) {
    return { success: false, hltbResults: {} };
  }

  if (!globalThis.SCPW_HltbClient) {
    return { success: false, hltbResults: {}, error: 'HLTB client not loaded' };
  }

  console.log(`${LOG_PREFIX} HLTB batch request for ${games.length} games`);

  const hltbResults: Record<string, HltbData | null> = {};
  const uncached: Array<{ appid: string; gameName: string }> = [];

  // Check cache first
  // Note: Treat HLTB data with all zeros or missing hltbId as uncached (likely from old broken API)
  for (const { appid, gameName } of games) {
    const cached = await globalThis.SCPW_Cache.getFromCache(appid);
    const hltb = cached?.hltbData;

    // Check for "not found" marker - don't re-search, return null
    if (hltb && hltb.hltbId === HLTB_NOT_FOUND_ID) {
      hltbResults[appid] = null;
      continue;
    }

    // Require valid hltbId for clickable badges AND valid time data
    const hasValidHltbData = hltb && hltb.hltbId > 0 && (hltb.mainStory > 0 || hltb.mainExtra > 0 || hltb.completionist > 0);
    if (hasValidHltbData) {
      hltbResults[appid] = hltb;
    } else {
      uncached.push({ appid, gameName });
    }
  }

  // Query HLTB for uncached games
  console.log(`${LOG_PREFIX} HLTB: ${games.length} total, ${games.length - uncached.length} cached, ${uncached.length} to query`);
  if (uncached.length > 0) {
    console.log(`${LOG_PREFIX} HLTB querying games:`, uncached.map(g => `${g.appid}:${g.gameName}`).join(', '));
    try {
      console.log(`${LOG_PREFIX} HLTB: SCPW_HltbClient available:`, !!globalThis.SCPW_HltbClient);
      const batchResults = await globalThis.SCPW_HltbClient.batchQueryByGameNames(uncached);
      console.log(`${LOG_PREFIX} HLTB batch returned ${batchResults.size} results`);
      // Debug: log first result details
      if (batchResults.size > 0) {
        const firstEntry = batchResults.entries().next().value;
        if (firstEntry) {
          const [appid, result] = firstEntry;
          console.log(`${LOG_PREFIX} HLTB first result (${appid}):`, JSON.stringify(result?.data || 'null'));
        }
      }

      for (const { appid } of uncached) {
        const hltbResult = batchResults.get(appid);
        console.log(`${LOG_PREFIX} HLTB result for ${appid}: ${hltbResult ? `mainStory=${hltbResult.data.mainStory}h, hltbId=${hltbResult.data.hltbId}, similarity=${hltbResult.similarity}` : 'null'}`);

        // Update cache
        const cached = await globalThis.SCPW_Cache.getFromCache(appid);
        if (hltbResult) {
          hltbResults[appid] = hltbResult.data;
          if (cached) {
            cached.hltbData = hltbResult.data;
            await globalThis.SCPW_Cache.saveToCache(cached);
          }
        } else {
          // Save "not found" marker to prevent repeated searches
          hltbResults[appid] = null;
          if (cached) {
            cached.hltbData = createHltbNotFoundMarker();
            await globalThis.SCPW_Cache.saveToCache(cached);
            console.log(`${LOG_PREFIX} HLTB cached as not found: ${appid}`);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`${LOG_PREFIX} HLTB batch error:`, errorMessage);
      // Mark uncached as null
      for (const { appid } of uncached) {
        if (!(appid in hltbResults)) {
          hltbResults[appid] = null;
        }
      }
    }
  }

  console.log(`${LOG_PREFIX} HLTB batch complete: ${Object.keys(hltbResults).length} results`);
  return { success: true, hltbResults };
}

chrome.runtime.onMessage.addListener(handleMessage);
console.log(`${LOG_PREFIX} Service worker initialized`);
