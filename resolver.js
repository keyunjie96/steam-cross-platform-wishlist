/**
 * Steam Cross-Platform Wishlist - Resolver
 *
 * Coordinates between IGDB lookups and the cache system.
 * Handles graceful fallbacks when credentials are not configured
 * or when games are not found in IGDB.
 */

const LOG_PREFIX = '[XCPW Resolver]';

// Pending resolution queue to batch requests
let pendingResolutions = [];
let resolutionTimeout = null;
const BATCH_DELAY_MS = 100; // Wait 100ms to collect batch requests

/**
 * Gets the store URLs helper from types.js
 * @returns {Object}
 */
function getStoreUrls() {
  return globalThis.XCPW_StoreUrls;
}

/**
 * Converts IGDB resolution to cache entry format
 * @param {string} appid
 * @param {string} gameName
 * @param {Object} igdbResult - Result from IGDB client
 * @returns {import('./types.js').CacheEntry}
 */
function igdbResultToCacheEntry(appid, gameName, igdbResult) {
  const StoreUrls = getStoreUrls();

  /**
   * Determines platform status from IGDB result
   * @param {Object} platformResult
   * @param {boolean} foundInIGDB
   * @returns {'available' | 'unavailable' | 'unknown'}
   */
  function getStatus(platformResult, foundInIGDB) {
    if (!foundInIGDB) {
      return 'unknown';
    }
    return platformResult.available ? 'available' : 'unavailable';
  }

  /**
   * Gets the best URL for a platform
   * Falls back to search URL if no official store URL
   * @param {Object} platformResult
   * @param {string} platform
   * @param {string} name
   * @returns {string}
   */
  function getUrl(platformResult, platform, name) {
    if (platformResult.storeUrl) {
      return platformResult.storeUrl;
    }
    // Fall back to search URL
    return StoreUrls[platform](name);
  }

  const displayName = igdbResult.gameName || gameName;

  return {
    appid,
    gameName: displayName,
    platforms: {
      nintendo: {
        status: getStatus(igdbResult.nintendo, igdbResult.found),
        storeUrl: getUrl(igdbResult.nintendo, 'nintendo', displayName)
      },
      playstation: {
        status: getStatus(igdbResult.playstation, igdbResult.found),
        storeUrl: getUrl(igdbResult.playstation, 'playstation', displayName)
      },
      xbox: {
        status: getStatus(igdbResult.xbox, igdbResult.found),
        storeUrl: getUrl(igdbResult.xbox, 'xbox', displayName)
      }
    },
    source: igdbResult.found ? 'igdb' : 'fallback',
    igdbId: igdbResult.igdbId,
    resolvedAt: Date.now(),
    ttlDays: 7
  };
}

/**
 * Creates a fallback cache entry when credentials are not configured
 * or resolution fails. All platforms marked as "unknown".
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
    source: 'none',
    igdbId: null,
    resolvedAt: Date.now(),
    ttlDays: 7
  };
}

/**
 * Resolves platform availability for a single game.
 * Uses IGDB if credentials are configured, otherwise falls back to unknown.
 *
 * @param {string} appid - Steam application ID
 * @param {string} gameName - Game name
 * @returns {Promise<{entry: import('./types.js').CacheEntry, fromCache: boolean}>}
 */
async function resolvePlatformData(appid, gameName) {
  const Cache = globalThis.XCPW_Cache;
  const TokenManager = globalThis.XCPW_TokenManager;
  const IGDBClient = globalThis.XCPW_IGDBClient;

  // Check cache first
  const cached = await Cache.getFromCache(appid);
  if (cached) {
    // Update game name if changed
    if (cached.gameName !== gameName) {
      cached.gameName = gameName;
      const StoreUrls = getStoreUrls();
      // Only update search URLs for unknown status (don't override official URLs)
      for (const platform of ['nintendo', 'playstation', 'xbox']) {
        if (cached.platforms[platform].status === 'unknown' || !cached.platforms[platform].storeUrl?.includes('http')) {
          cached.platforms[platform].storeUrl = StoreUrls[platform](gameName);
        }
      }
      await Cache.saveToCache(cached);
    }
    return { entry: cached, fromCache: true };
  }

  // Check for manual overrides first
  const override = Cache.MANUAL_OVERRIDES?.[appid];
  if (override) {
    const StoreUrls = getStoreUrls();
    const entry = {
      appid,
      gameName,
      platforms: {
        nintendo: {
          status: override.nintendo || 'unknown',
          storeUrl: StoreUrls.nintendo(gameName)
        },
        playstation: {
          status: override.playstation || 'unknown',
          storeUrl: StoreUrls.playstation(gameName)
        },
        xbox: {
          status: override.xbox || 'unknown',
          storeUrl: StoreUrls.xbox(gameName)
        }
      },
      source: 'manual',
      igdbId: null,
      resolvedAt: Date.now(),
      ttlDays: 7
    };
    await Cache.saveToCache(entry);
    console.log(`${LOG_PREFIX} Using manual override for appid ${appid}`);
    return { entry, fromCache: false };
  }

  // Try to get IGDB token
  const tokenResult = await TokenManager.getValidToken();

  if (!tokenResult) {
    // No credentials configured - use fallback
    console.log(`${LOG_PREFIX} No credentials, using fallback for appid ${appid}`);
    const entry = createFallbackEntry(appid, gameName);
    await Cache.saveToCache(entry);
    return { entry, fromCache: false };
  }

  // Resolve via IGDB
  try {
    const igdbResult = await IGDBClient.resolvePlatformAvailability(
      appid,
      gameName,
      tokenResult.accessToken,
      tokenResult.clientId
    );

    const entry = igdbResultToCacheEntry(appid, gameName, igdbResult);
    await Cache.saveToCache(entry);

    console.log(`${LOG_PREFIX} Resolved via IGDB: ${appid} (found=${igdbResult.found})`);
    return { entry, fromCache: false };
  } catch (error) {
    console.error(`${LOG_PREFIX} IGDB resolution failed for ${appid}:`, error);
    const entry = createFallbackEntry(appid, gameName);
    await Cache.saveToCache(entry);
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
  const TokenManager = globalThis.XCPW_TokenManager;
  const IGDBClient = globalThis.XCPW_IGDBClient;
  const results = new Map();

  // First, check cache for all games
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
    console.log(`${LOG_PREFIX} All ${games.length} games found in cache`);
    return results;
  }

  console.log(`${LOG_PREFIX} Batch resolving ${uncached.length} games (${games.length - uncached.length} cached)`);

  // Check for manual overrides
  const needsIGDB = [];
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
        igdbId: null,
        resolvedAt: Date.now(),
        ttlDays: 7
      };
      await Cache.saveToCache(entry);
      results.set(appid, { entry, fromCache: false });
    } else {
      needsIGDB.push({ appid, gameName });
    }
  }

  if (needsIGDB.length === 0) {
    return results;
  }

  // Try to get IGDB token
  const tokenResult = await TokenManager.getValidToken();

  if (!tokenResult) {
    // No credentials - use fallback for all
    console.log(`${LOG_PREFIX} No credentials, using fallback for ${needsIGDB.length} games`);
    for (const { appid, gameName } of needsIGDB) {
      const entry = createFallbackEntry(appid, gameName);
      await Cache.saveToCache(entry);
      results.set(appid, { entry, fromCache: false });
    }
    return results;
  }

  // Batch resolve via IGDB
  try {
    const igdbResults = await IGDBClient.batchResolvePlatformAvailability(
      needsIGDB,
      tokenResult.accessToken,
      tokenResult.clientId
    );

    for (const { appid, gameName } of needsIGDB) {
      const igdbResult = igdbResults.get(appid);
      if (igdbResult) {
        const entry = igdbResultToCacheEntry(appid, gameName, igdbResult);
        await Cache.saveToCache(entry);
        results.set(appid, { entry, fromCache: false });
      } else {
        // Not found in batch result - create fallback
        const entry = createFallbackEntry(appid, gameName);
        await Cache.saveToCache(entry);
        results.set(appid, { entry, fromCache: false });
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Batch IGDB resolution failed:`, error);
    // Fallback for all remaining
    for (const { appid, gameName } of needsIGDB) {
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
 * Checks if IGDB integration is available (credentials configured)
 * @returns {Promise<boolean>}
 */
async function isIGDBAvailable() {
  const TokenManager = globalThis.XCPW_TokenManager;
  return TokenManager.hasCredentials();
}

/**
 * Forces a refresh of platform data from IGDB, bypassing cache
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
  isIGDBAvailable,
  forceRefresh,
  createFallbackEntry
};
