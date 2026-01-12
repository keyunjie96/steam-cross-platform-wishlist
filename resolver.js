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
const RESOLVER_DEBUG = false; // Set to true for verbose debugging

/**
 * Gets the store URLs helper from types.js
 * @returns {Object}
 */
function getStoreUrls() {
  return globalThis.XCPW_StoreUrls;
}

/**
 * Converts Wikidata result to cache entry format
 * @param {string} appid
 * @param {string} gameName
 * @param {Object} wikidataResult - Result from Wikidata client
 * @returns {import('./types.js').CacheEntry}
 */
function wikidataResultToCacheEntry(appid, gameName, wikidataResult) {
  const StoreUrls = getStoreUrls();
  const WikidataClient = globalThis.XCPW_WikidataClient;

  /**
   * Determines platform status from Wikidata result
   * @param {boolean} available
   * @param {boolean} foundInWikidata
   * @returns {'available' | 'unavailable' | 'unknown'}
   */
  function getStatus(available, foundInWikidata) {
    if (!foundInWikidata) {
      return 'unknown';
    }
    return available ? 'available' : 'unavailable';
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
   * Gets the best URL for a platform
   * @param {string} platform
   * @param {boolean} available
   * @param {Object} storeIds
   * @param {string} name
   * @returns {string}
   */
  function getUrl(platform, available, storeIds, name) {
    // Try to get official store URL from Wikidata
    const officialUrl = WikidataClient.getStoreUrl(platform, storeIds);
    if (officialUrl) {
      return officialUrl;
    }
    // Fall back to search URL
    return StoreUrls[platform](name);
  }

  // Use Wikidata game name only if it's not a QID (fallback for missing labels)
  // Always prefer Steam's game name for URLs since it's more reliable
  const wikidataName = wikidataResult.gameName;
  const displayName = (wikidataName && !isWikidataQID(wikidataName)) ? wikidataName : gameName;

  return {
    appid,
    gameName: displayName,
    platforms: {
      nintendo: {
        status: getStatus(wikidataResult.platforms.nintendo, wikidataResult.found),
        storeUrl: getUrl('nintendo', wikidataResult.platforms.nintendo, wikidataResult.storeIds, displayName)
      },
      playstation: {
        status: getStatus(wikidataResult.platforms.playstation, wikidataResult.found),
        storeUrl: getUrl('playstation', wikidataResult.platforms.playstation, wikidataResult.storeIds, displayName)
      },
      xbox: {
        status: getStatus(wikidataResult.platforms.xbox, wikidataResult.found),
        storeUrl: getUrl('xbox', wikidataResult.platforms.xbox, wikidataResult.storeIds, displayName)
      }
    },
    source: wikidataResult.found ? 'wikidata' : 'fallback',
    wikidataId: wikidataResult.wikidataId,
    resolvedAt: Date.now(),
    ttlDays: 7
  };
}

/**
 * Creates a fallback cache entry when resolution fails.
 * All platforms marked as "unknown".
 * @param {string} appid
 * @param {string} gameName
 * @returns {import('./types.js').CacheEntry}
 */
function createFallbackEntry(appid, gameName) {
  const StoreUrls = getStoreUrls();

  return {
    appid,
    gameName,
    platforms: {
      nintendo: {
        status: 'unknown',
        storeUrl: StoreUrls.nintendo(gameName)
      },
      playstation: {
        status: 'unknown',
        storeUrl: StoreUrls.playstation(gameName)
      },
      xbox: {
        status: 'unknown',
        storeUrl: StoreUrls.xbox(gameName)
      }
    },
    source: 'fallback',
    wikidataId: null,
    resolvedAt: Date.now(),
    ttlDays: 7
  };
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

  // Verify dependencies are loaded
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
    // Update game name if changed
    if (cached.gameName !== gameName) {
      cached.gameName = gameName;
      const StoreUrls = getStoreUrls();
      // Update search URLs for unknown status (don't override official URLs)
      for (const platform of ['nintendo', 'playstation', 'xbox']) {
        if (cached.platforms[platform].status === 'unknown') {
          cached.platforms[platform].storeUrl = StoreUrls[platform](gameName);
        }
      }
      await Cache.saveToCache(cached);
    }
    return { entry: cached, fromCache: true };
  }

  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Cache MISS for appid ${appid}, checking manual overrides`);

  // 2. Check for manual overrides
  const override = Cache.MANUAL_OVERRIDES?.[appid];
  if (override) {
    const StoreUrls = getStoreUrls();
    const entry = {
      appid,
      gameName,
      platforms: {
        nintendo: { status: override.nintendo || 'unknown', storeUrl: StoreUrls.nintendo(gameName) },
        playstation: { status: override.playstation || 'unknown', storeUrl: StoreUrls.playstation(gameName) },
        xbox: { status: override.xbox || 'unknown', storeUrl: StoreUrls.xbox(gameName) }
      },
      source: 'manual',
      wikidataId: null,
      resolvedAt: Date.now(),
      ttlDays: 7
    };
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

    if (wikidataResult.found) {
      const entry = wikidataResultToCacheEntry(appid, gameName, wikidataResult);
      await Cache.saveToCache(entry);
      console.log(`${RESOLVER_LOG_PREFIX} Resolved via Wikidata: ${appid}`);
      return { entry, fromCache: false };
    } else {
      if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Wikidata found no match for appid ${appid}`);
    }
  } catch (error) {
    // Wikidata query failed - fall back silently
  }

  // 4. Fallback - no data available, will retry on next page load
  const entry = createFallbackEntry(appid, gameName);
  await Cache.saveToCache(entry);
  return { entry, fromCache: false };
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
      const StoreUrls = getStoreUrls();
      const entry = {
        appid,
        gameName,
        platforms: {
          nintendo: { status: override.nintendo || 'unknown', storeUrl: StoreUrls.nintendo(gameName) },
          playstation: { status: override.playstation || 'unknown', storeUrl: StoreUrls.playstation(gameName) },
          xbox: { status: override.xbox || 'unknown', storeUrl: StoreUrls.xbox(gameName) }
        },
        source: 'manual',
        wikidataId: null,
        resolvedAt: Date.now(),
        ttlDays: 7
      };
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

      if (wikidataResult?.found) {
        const entry = wikidataResultToCacheEntry(appid, gameName, wikidataResult);
        await Cache.saveToCache(entry);
        results.set(appid, { entry, fromCache: false });
      } else {
        // Fallback for not found
        const entry = createFallbackEntry(appid, gameName);
        await Cache.saveToCache(entry);
        results.set(appid, { entry, fromCache: false });
      }
    }

    console.log(`${RESOLVER_LOG_PREFIX} Wikidata batch resolved ${needsResolution.length} games`);
  } catch (error) {
    console.error(`${RESOLVER_LOG_PREFIX} Batch Wikidata resolution failed:`, error);
    // Fallback for all remaining
    for (const { appid, gameName } of needsResolution) {
      if (!results.has(appid)) {
        const entry = createFallbackEntry(appid, gameName);
        await Cache.saveToCache(entry);
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
  const Cache = globalThis.XCPW_Cache;

  // Remove from cache first
  const cacheKey = `xcpw_cache_${appid}`;
  await chrome.storage.local.remove(cacheKey);

  // Resolve fresh
  return resolvePlatformData(appid, gameName);
}

// Export for service worker
globalThis.XCPW_Resolver = {
  resolvePlatformData,
  batchResolvePlatformData,
  forceRefresh,
  createFallbackEntry
};
