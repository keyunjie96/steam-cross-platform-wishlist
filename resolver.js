/**
 * Steam Cross-Platform Wishlist - Resolver
 *
 * Coordinates between Wikidata and the cache system.
 * Resolution priority:
 *   1. Cache (if valid)
 *   2. Manual overrides
 *   3. Wikidata (no auth required)
 *   4. Fallback (unknown status with search URLs)
 */

const RESOLVER_LOG_PREFIX = '[XCPW Resolver]';
const RESOLVER_DEBUG = false;

// Helper to get PLATFORMS - uses cache module in service worker, fallback for tests
function getPlatforms() {
  return globalThis.XCPW_Cache?.PLATFORMS || ['nintendo', 'playstation', 'xbox'];
}

/**
 * Checks if a string looks like a Wikidata QID (e.g., "Q123456")
 * @param {string} str
 * @returns {boolean}
 */
function isWikidataQID(str) {
  return /^Q\d+$/.test(str);
}

/**
 * Gets platform status from Wikidata result
 * @param {boolean} available
 * @param {boolean} foundInWikidata
 * @returns {'available' | 'unavailable' | 'unknown'}
 */
function getPlatformStatus(available, foundInWikidata) {
  if (!foundInWikidata) {
    return 'unknown';
  }
  return available ? 'available' : 'unavailable';
}

/**
 * Creates a platform data object for all platforms
 * @param {function(string): {status: string, storeUrl: string}} platformMapper
 * @returns {Record<string, {status: string, storeUrl: string}>}
 */
function createPlatformsObject(platformMapper) {
  const platforms = {};
  for (const platform of getPlatforms()) {
    platforms[platform] = platformMapper(platform);
  }
  return platforms;
}

/**
 * Creates a fallback cache entry when resolution fails.
 * All platforms marked as "unknown".
 * @param {string} appid
 * @param {string} gameName
 * @returns {import('./types.js').CacheEntry}
 */
function createFallbackEntry(appid, gameName) {
  const StoreUrls = globalThis.XCPW_StoreUrls;

  return {
    appid,
    gameName,
    platforms: createPlatformsObject((platform) => ({
      status: 'unknown',
      storeUrl: StoreUrls[platform](gameName)
    })),
    source: 'fallback',
    wikidataId: null,
    resolvedAt: Date.now(),
    ttlDays: 7
  };
}

/**
 * Creates a cache entry from manual override data
 * @param {string} appid
 * @param {string} gameName
 * @param {Object} override
 * @returns {import('./types.js').CacheEntry}
 */
function createManualOverrideEntry(appid, gameName, override) {
  const StoreUrls = globalThis.XCPW_StoreUrls;

  return {
    appid,
    gameName,
    platforms: createPlatformsObject((platform) => ({
      status: override[platform] || 'unknown',
      storeUrl: StoreUrls[platform](gameName)
    })),
    source: 'manual',
    wikidataId: null,
    resolvedAt: Date.now(),
    ttlDays: 7
  };
}

/**
 * Converts Wikidata result to cache entry format
 * @param {string} appid
 * @param {string} gameName
 * @param {Object} wikidataResult - Result from Wikidata client
 * @returns {import('./types.js').CacheEntry}
 */
function wikidataResultToCacheEntry(appid, gameName, wikidataResult) {
  const StoreUrls = globalThis.XCPW_StoreUrls;
  const WikidataClient = globalThis.XCPW_WikidataClient;

  // Use Wikidata game name only if it's not a QID (fallback for missing labels)
  const wikidataName = wikidataResult.gameName;
  const displayName = (wikidataName && !isWikidataQID(wikidataName)) ? wikidataName : gameName;

  /**
   * Gets the best URL for a platform - official store URL or search fallback
   * @param {string} platform
   * @returns {string}
   */
  function getUrl(platform) {
    const officialUrl = WikidataClient.getStoreUrl(platform, wikidataResult.storeIds);
    return officialUrl || StoreUrls[platform](displayName);
  }

  return {
    appid,
    gameName: displayName,
    platforms: createPlatformsObject((platform) => ({
      status: getPlatformStatus(wikidataResult.platforms[platform], wikidataResult.found),
      storeUrl: getUrl(platform)
    })),
    source: wikidataResult.found ? 'wikidata' : 'fallback',
    wikidataId: wikidataResult.wikidataId,
    resolvedAt: Date.now(),
    ttlDays: 7
  };
}

/**
 * Updates cache entry with new game name if changed
 * @param {import('./types.js').CacheEntry} cached
 * @param {string} gameName
 * @returns {Promise<import('./types.js').CacheEntry>}
 */
async function updateCachedEntryIfNeeded(cached, gameName) {
  if (cached.gameName === gameName) {
    return cached;
  }

  const StoreUrls = globalThis.XCPW_StoreUrls;
  const Cache = globalThis.XCPW_Cache;

  cached.gameName = gameName;
  // Update search URLs for unknown status only (don't override official URLs)
  for (const platform of getPlatforms()) {
    if (cached.platforms[platform].status === 'unknown') {
      cached.platforms[platform].storeUrl = StoreUrls[platform](gameName);
    }
  }
  await Cache.saveToCache(cached);
  return cached;
}

/**
 * Resolves platform availability for a single game.
 * Priority: Cache -> Manual Override -> Wikidata -> Fallback
 *
 * @param {string} appid - Steam application ID
 * @param {string} gameName - Game name
 * @returns {Promise<{entry: import('./types.js').CacheEntry, fromCache: boolean}>}
 */
async function resolvePlatformData(appid, gameName) {
  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} resolvePlatformData called: appid=${appid}, gameName=${gameName}`);

  const Cache = globalThis.XCPW_Cache;
  const WikidataClient = globalThis.XCPW_WikidataClient;

  if (!Cache) {
    console.error(`${RESOLVER_LOG_PREFIX} CRITICAL: XCPW_Cache not available!`);
    throw new Error('Cache module not loaded');
  }
  if (!WikidataClient) {
    console.error(`${RESOLVER_LOG_PREFIX} CRITICAL: XCPW_WikidataClient not available!`);
    throw new Error('WikidataClient module not loaded');
  }

  // 1. Check cache first
  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Checking cache for appid ${appid}`);
  const cached = await Cache.getFromCache(appid);
  if (cached) {
    if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Cache HIT for appid ${appid}`);
    const entry = await updateCachedEntryIfNeeded(cached, gameName);
    return { entry, fromCache: true };
  }

  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Cache MISS for appid ${appid}, checking manual overrides`);

  // 2. Check for manual overrides
  const override = Cache.MANUAL_OVERRIDES?.[appid];
  if (override) {
    const entry = createManualOverrideEntry(appid, gameName, override);
    await Cache.saveToCache(entry);
    console.log(`${RESOLVER_LOG_PREFIX} Using manual override for appid ${appid}`);
    return { entry, fromCache: false };
  }

  // 3. Try Wikidata
  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Querying Wikidata for appid ${appid}`);
  try {
    const wikidataResult = await WikidataClient.queryBySteamAppId(appid);

    if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Wikidata result for ${appid}:`, {
      found: wikidataResult?.found,
      wikidataId: wikidataResult?.wikidataId,
      platforms: wikidataResult?.platforms
    });

    const entry = wikidataResultToCacheEntry(appid, gameName, wikidataResult);

    if (wikidataResult.found) {
      await Cache.saveToCache(entry);
      console.log(`${RESOLVER_LOG_PREFIX} Resolved via Wikidata: ${appid}`);
    } else {
      // Game genuinely not in Wikidata - cache this result so we don't keep querying
      if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Wikidata found no match for appid ${appid}`);
      await Cache.saveToCache(entry);
    }
    return { entry, fromCache: false };
  } catch (error) {
    // Wikidata query failed (network error, 429, etc.)
    // DON'T cache - allow retry on next page load
    console.warn(`${RESOLVER_LOG_PREFIX} Wikidata query failed for ${appid}, will retry later:`, error.message);
    const entry = createFallbackEntry(appid, gameName);
    return { entry, fromCache: false };
  }
}

/**
 * Batch resolves platform availability for multiple games.
 * More efficient for bulk operations.
 *
 * @param {Array<{appid: string, gameName: string}>} games
 * @returns {Promise<Map<string, {entry: import('./types.js').CacheEntry, fromCache: boolean}>>}
 */
async function batchResolvePlatformData(games) {
  const Cache = globalThis.XCPW_Cache;
  const WikidataClient = globalThis.XCPW_WikidataClient;
  const results = new Map();

  // 1. Check cache for all games
  const uncached = [];
  for (const { appid, gameName } of games) {
    const cached = await Cache.getFromCache(appid);
    if (cached) {
      results.set(appid, { entry: cached, fromCache: true });
    } else {
      uncached.push({ appid, gameName });
    }
  }

  if (uncached.length === 0) {
    console.log(`${RESOLVER_LOG_PREFIX} All ${games.length} games found in cache`);
    return results;
  }

  console.log(`${RESOLVER_LOG_PREFIX} Batch resolving ${uncached.length} games (${games.length - uncached.length} cached)`);

  // 2. Check for manual overrides
  const needsResolution = [];
  for (const { appid, gameName } of uncached) {
    const override = Cache.MANUAL_OVERRIDES?.[appid];
    if (override) {
      const entry = createManualOverrideEntry(appid, gameName, override);
      await Cache.saveToCache(entry);
      results.set(appid, { entry, fromCache: false });
    } else {
      needsResolution.push({ appid, gameName });
    }
  }

  if (needsResolution.length === 0) {
    return results;
  }

  // 3. Batch query Wikidata
  try {
    const appIds = needsResolution.map(g => g.appid);
    const wikidataResults = await WikidataClient.batchQueryBySteamAppIds(appIds);

    for (const { appid, gameName } of needsResolution) {
      const wikidataResult = wikidataResults.get(appid);
      const entry = wikidataResult?.found
        ? wikidataResultToCacheEntry(appid, gameName, wikidataResult)
        : createFallbackEntry(appid, gameName);

      await Cache.saveToCache(entry);
      results.set(appid, { entry, fromCache: false });
    }

    console.log(`${RESOLVER_LOG_PREFIX} Wikidata batch resolved ${needsResolution.length} games`);
  } catch (error) {
    // Batch Wikidata query failed - DON'T cache to allow retry
    console.warn(`${RESOLVER_LOG_PREFIX} Batch Wikidata resolution failed, will retry later:`, error.message);
    for (const { appid, gameName } of needsResolution) {
      if (!results.has(appid)) {
        const entry = createFallbackEntry(appid, gameName);
        results.set(appid, { entry, fromCache: false });
      }
    }
  }

  return results;
}

/**
 * Forces a refresh of platform data, bypassing cache
 * @param {string} appid
 * @param {string} gameName
 * @returns {Promise<{entry: import('./types.js').CacheEntry, fromCache: boolean}>}
 */
async function forceRefresh(appid, gameName) {
  const cacheKey = `xcpw_cache_${appid}`;
  await chrome.storage.local.remove(cacheKey);
  return resolvePlatformData(appid, gameName);
}

// Export for service worker
globalThis.XCPW_Resolver = {
  resolvePlatformData,
  batchResolvePlatformData,
  forceRefresh,
  createFallbackEntry
};
