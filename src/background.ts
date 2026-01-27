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
importScripts('types.js', 'cache.js', 'wikidataClient.js', 'hltbClient.js', 'reviewScoresClient.js', 'resolver.js');

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
  GetHltbDataBatchResponse,
  ReviewScoreData,
  GetReviewScoresRequest,
  GetReviewScoresResponse,
  GetReviewScoresBatchRequest
} from './types';

const LOG_PREFIX = '[SCPW Background]';

// Sentinel value for "searched HLTB but no match found" - prevents repeated searches
const HLTB_NOT_FOUND_ID = -1;

// Sentinel value for "searched review scores but no match found" - prevents repeated searches
const REVIEW_SCORES_NOT_FOUND_ID = -1;

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

/**
 * Creates a "not found" marker for review scores to prevent repeated searches.
 */
function createReviewScoresNotFoundMarker(): ReviewScoreData {
  return {
    openCriticId: REVIEW_SCORES_NOT_FOUND_ID,
    score: 0,
    tier: 'Unknown',
    numReviews: 0,
    percentRecommended: 0
  };
}

interface AsyncResponse {
  success: boolean;
  data?: CacheEntry | HltbData | ReviewScoreData | null;
  fromCache?: boolean;
  error?: string;
  count?: number;
  oldestEntry?: number | null;
  results?: Record<string, { data: CacheEntry; fromCache: boolean }>;
  hltbResults?: Record<string, HltbData | null>;
  reviewScoresResults?: Record<string, ReviewScoreData | null>;
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

    case 'GET_REVIEW_SCORES':
      handleAsync(() => getReviewScores(message as GetReviewScoresRequest), sendResponse, { success: false, data: null });
      return true;

    case 'GET_REVIEW_SCORES_BATCH':
      handleAsync(() => getBatchReviewScores(message as GetReviewScoresBatchRequest), sendResponse, { success: false, reviewScoresResults: {} });
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

/**
 * Gets review scores for a single game
 */
async function getReviewScores(message: GetReviewScoresRequest): Promise<GetReviewScoresResponse> {
  const { appid, gameName } = message;

  if (!appid || !gameName) {
    return { success: false, data: null, error: 'Missing appid or gameName' };
  }

  if (!globalThis.SCPW_ReviewScoresClient) {
    return { success: false, data: null, error: 'Review scores client not loaded' };
  }

  // Check if we have cached review score data first
  const cached = await globalThis.SCPW_Cache.getFromCache(appid);
  const reviewScore = cached?.reviewScoreData;

  // Check for "not found" marker - don't re-search
  if (reviewScore && reviewScore.openCriticId === REVIEW_SCORES_NOT_FOUND_ID) {
    console.log(`${LOG_PREFIX} Review scores cache hit (not found) for appid ${appid}`);
    return { success: true, data: null };
  }

  // Check for valid cached data
  if (reviewScore && reviewScore.openCriticId > 0 && reviewScore.score > 0) {
    console.log(`${LOG_PREFIX} Review scores cache hit for appid ${appid} (openCriticId=${reviewScore.openCriticId})`);
    return { success: true, data: reviewScore };
  }

  // Query OpenCritic
  try {
    console.log(`${LOG_PREFIX} Review scores querying for "${gameName}" (appid: ${appid})`);
    const result = await globalThis.SCPW_ReviewScoresClient.queryByGameName(gameName);

    if (result) {
      // Update cache with review score data
      if (cached) {
        cached.reviewScoreData = result.data;
        await globalThis.SCPW_Cache.saveToCache(cached);
      }
      console.log(`${LOG_PREFIX} Review scores resolved for appid ${appid}: ${result.data.score}`);
      return { success: true, data: result.data };
    }

    // Save "not found" marker to cache to prevent repeated searches
    if (cached) {
      cached.reviewScoreData = createReviewScoresNotFoundMarker();
      await globalThis.SCPW_Cache.saveToCache(cached);
    }
    console.log(`${LOG_PREFIX} Review scores no match for appid ${appid} (cached as not found)`);
    return { success: true, data: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG_PREFIX} Review scores error for ${appid}:`, errorMessage);
    return { success: false, data: null, error: errorMessage };
  }
}

/**
 * Gets review scores for multiple games in batch
 */
async function getBatchReviewScores(message: GetReviewScoresBatchRequest): Promise<AsyncResponse> {
  const { games } = message;

  if (!games || !Array.isArray(games) || games.length === 0) {
    return { success: false, reviewScoresResults: {} };
  }

  if (!globalThis.SCPW_ReviewScoresClient) {
    return { success: false, reviewScoresResults: {}, error: 'Review scores client not loaded' };
  }

  console.log(`${LOG_PREFIX} Review scores batch request for ${games.length} games`);

  const reviewScoresResults: Record<string, ReviewScoreData | null> = {};
  const uncached: Array<{ appid: string; gameName: string }> = [];

  // Check cache first
  for (const { appid, gameName } of games) {
    const cached = await globalThis.SCPW_Cache.getFromCache(appid);
    const reviewScore = cached?.reviewScoreData;

    // Check for "not found" marker - don't re-search, return null
    if (reviewScore && reviewScore.openCriticId === REVIEW_SCORES_NOT_FOUND_ID) {
      reviewScoresResults[appid] = null;
      continue;
    }

    // Require valid openCriticId and score
    const hasValidData = reviewScore && reviewScore.openCriticId > 0 && reviewScore.score > 0;
    if (hasValidData) {
      reviewScoresResults[appid] = reviewScore;
    } else {
      uncached.push({ appid, gameName });
    }
  }

  // Query OpenCritic for uncached games
  // First, enrich uncached with openCriticId from Wikidata cache (if available)
  const uncachedWithIds: Array<{ appid: string; gameName: string; openCriticId?: string | null }> = [];
  for (const { appid, gameName } of uncached) {
    const cached = await globalThis.SCPW_Cache.getFromCache(appid);
    uncachedWithIds.push({
      appid,
      gameName,
      openCriticId: cached?.openCriticId || null
    });
  }

  const diagnostic = {
    total: games.length,
    cached: games.length - uncached.length,
    toQuery: uncached.length,
    withOpenCriticId: uncachedWithIds.filter(g => g.openCriticId).length,
    apiCalled: false,
    apiResults: 0,
    nullResults: 0,
    validResults: 0,
    gameDetails: [] as Array<{ appid: string; gameName: string; hasResult: boolean; score?: number; failureReason?: string; hadOpenCriticId?: boolean }>,
    failureReasons: {} as Record<string, string>,
    error: null as string | null
  };
  console.log(`${LOG_PREFIX} Review scores: ${games.length} total, ${games.length - uncached.length} cached, ${uncached.length} to query (${diagnostic.withOpenCriticId} with OpenCritic ID from Wikidata)`);
  if (uncachedWithIds.length > 0) {
    try {
      diagnostic.apiCalled = true;
      const batchResponse = await globalThis.SCPW_ReviewScoresClient.batchQueryByGameNames(uncachedWithIds);
      // Handle both old Map return (for cached code) and new { results, failureReasons } return
      const batchResults: Map<string, { data: ReviewScoreData } | null> =
        batchResponse instanceof Map ? batchResponse : batchResponse.results;
      const failureReasons: Record<string, string> =
        batchResponse instanceof Map ? {} : (batchResponse.failureReasons || {});

      diagnostic.apiResults = batchResults.size;
      diagnostic.failureReasons = failureReasons;

      // Track details for each game
      for (const { appid, gameName, openCriticId } of uncachedWithIds) {
        const result = batchResults.get(appid);
        const failureReason = failureReasons[appid];
        if (result) {
          diagnostic.validResults++;
          diagnostic.gameDetails.push({ appid, gameName, hasResult: true, score: result.data.score, hadOpenCriticId: !!openCriticId });
        } else {
          diagnostic.nullResults++;
          diagnostic.gameDetails.push({ appid, gameName, hasResult: false, failureReason, hadOpenCriticId: !!openCriticId });
        }
      }

      console.log(`${LOG_PREFIX} Review scores batch returned ${batchResults.size} results (${diagnostic.validResults} valid, ${diagnostic.nullResults} null)`);
      if (Object.keys(failureReasons).length > 0) {
        console.log(`${LOG_PREFIX} Failure reasons:`, JSON.stringify(failureReasons));
      }

      for (const { appid } of uncachedWithIds) {
        const result = batchResults.get(appid);

        // Update cache
        const cached = await globalThis.SCPW_Cache.getFromCache(appid);
        if (result) {
          reviewScoresResults[appid] = result.data;
          if (cached) {
            cached.reviewScoreData = result.data;
            await globalThis.SCPW_Cache.saveToCache(cached);
          }
        } else {
          // Save "not found" marker to prevent repeated searches
          reviewScoresResults[appid] = null;
          if (cached) {
            cached.reviewScoreData = createReviewScoresNotFoundMarker();
            await globalThis.SCPW_Cache.saveToCache(cached);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      diagnostic.error = errorMessage;
      console.warn(`${LOG_PREFIX} Review scores batch error:`, errorMessage);
      // Mark uncached as null
      for (const { appid } of uncachedWithIds) {
        if (!(appid in reviewScoresResults)) {
          reviewScoresResults[appid] = null;
        }
      }
    }
  }

  console.log(`${LOG_PREFIX} Review scores batch complete: ${Object.keys(reviewScoresResults).length} results, diagnostic:`, JSON.stringify(diagnostic));
  return { success: true, reviewScoresResults, _diagnostic: diagnostic };
}

chrome.runtime.onMessage.addListener(handleMessage);
console.log(`${LOG_PREFIX} Service worker initialized (v0.7.1)`);
