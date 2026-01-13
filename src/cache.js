/**
 * Steam Cross-Platform Wishlist - Cache Module
 *
 * Handles all chrome.storage.local operations for caching platform availability data.
 * This module runs in the background service worker context.
 */

const CACHE_KEY_PREFIX = 'xcpw_cache_';
const DEFAULT_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PLATFORMS = ['nintendo', 'playstation', 'xbox'];

/**
 * Creates a platform availability object
 * @param {Object} options
 * @param {boolean} [options.allAvailable] - Set all platforms to available
 * @param {string[]} [options.unavailable] - Platforms to mark as unavailable
 * @returns {Record<string, import('./types.js').PlatformStatus>}
 */
function platformStatus({ allAvailable = false, unavailable = [] } = {}) {
  function getStatus(platform) {
    if (unavailable.includes(platform)) return 'unavailable';
    if (allAvailable) return 'available';
    return 'unknown';
  }
  return Object.fromEntries(PLATFORMS.map(p => [p, getStatus(p)]));
}

/**
 * Manual override map for testing purposes.
 * These appids will show specific platform availability regardless of actual data.
 * In production, this would be empty and data would come from actual lookups.
 */
const MANUAL_OVERRIDES = {
  '367520': platformStatus({ allAvailable: true }),   // Hollow Knight
  '1145360': platformStatus({ allAvailable: true }),  // Hades
  '504230': platformStatus({ allAvailable: true }),   // Celeste
  '413150': platformStatus({ allAvailable: true }),   // Stardew Valley
  '632470': platformStatus({ allAvailable: true }),   // Disco Elysium
  '1245620': platformStatus({ allAvailable: true, unavailable: ['nintendo'] }), // Elden Ring
  '1086940': platformStatus({ allAvailable: true, unavailable: ['nintendo'] }), // Baldur's Gate 3
  '1091500': platformStatus({ allAvailable: true, unavailable: ['nintendo'] })  // Cyberpunk 2077
};

/**
 * Gets the cache key for a given appid
 * @param {string} appid
 * @returns {string}
 */
function getCacheKey(appid) {
  return `${CACHE_KEY_PREFIX}${appid}`;
}

/**
 * Checks if a cache entry is still valid based on TTL
 * @param {import('./types.js').CacheEntry} entry
 * @returns {boolean}
 */
function isCacheValid(entry) {
  if (!entry?.resolvedAt || !entry?.ttlDays) {
    return false;
  }
  const expiresAt = entry.resolvedAt + entry.ttlDays * MS_PER_DAY;
  return Date.now() < expiresAt;
}

/**
 * Creates a cache entry for a given appid and game name.
 * For Stage 1/fallback, uses manual overrides or marks all platforms as "unknown".
 * Stage 2 uses the resolver which creates entries with IGDB data.
 *
 * @param {string} appid
 * @param {string} gameName
 * @returns {import('./types.js').CacheEntry}
 */
function createCacheEntry(appid, gameName) {
  const override = MANUAL_OVERRIDES[appid];
  const StoreUrls = globalThis.XCPW_StoreUrls;

  const platforms = Object.fromEntries(
    PLATFORMS.map(platform => [platform, {
      status: override?.[platform] || 'unknown',
      storeUrl: StoreUrls[platform](gameName)
    }])
  );

  return {
    appid,
    gameName,
    platforms,
    source: override ? 'manual' : 'none',
    igdbId: null,
    resolvedAt: Date.now(),
    ttlDays: DEFAULT_TTL_DAYS
  };
}

/**
 * Retrieves cached data for a given appid
 * @param {string} appid
 * @returns {Promise<import('./types.js').CacheEntry | null>}
 */
async function getFromCache(appid) {
  const key = getCacheKey(appid);
  const result = await chrome.storage.local.get(key);
  const entry = result[key];

  if (entry && isCacheValid(entry)) {
    return entry;
  }

  return null;
}

/**
 * Saves data to cache
 * @param {import('./types.js').CacheEntry} entry
 * @returns {Promise<void>}
 */
async function saveToCache(entry) {
  const key = getCacheKey(entry.appid);
  await chrome.storage.local.set({ [key]: entry });
}

/**
 * Regenerates store URLs for all platforms with a new game name
 * @param {import('./types.js').CacheEntry} entry
 * @param {string} gameName
 */
function updateStoreUrls(entry, gameName) {
  const StoreUrls = globalThis.XCPW_StoreUrls;
  for (const platform of PLATFORMS) {
    entry.platforms[platform].storeUrl = StoreUrls[platform](gameName);
  }
}

/**
 * Gets or creates platform data for an appid.
 * Returns cached data if available, otherwise creates new entry.
 *
 * @param {string} appid
 * @param {string} gameName
 * @returns {Promise<{entry: import('./types.js').CacheEntry, fromCache: boolean}>}
 */
async function getOrCreatePlatformData(appid, gameName) {
  const cached = await getFromCache(appid);
  if (cached) {
    if (cached.gameName !== gameName) {
      cached.gameName = gameName;
      updateStoreUrls(cached, gameName);
      await saveToCache(cached);
    }
    return { entry: cached, fromCache: true };
  }

  const entry = createCacheEntry(appid, gameName);
  await saveToCache(entry);
  return { entry, fromCache: false };
}

/**
 * Clears all cached data (useful for debugging)
 * @returns {Promise<void>}
 */
async function clearCache() {
  const allData = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(allData).filter(key => key.startsWith(CACHE_KEY_PREFIX));
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}

/**
 * Gets cache statistics
 * @returns {Promise<{count: number, oldestEntry: number | null}>}
 */
async function getCacheStats() {
  const allData = await chrome.storage.local.get(null);
  const cacheEntries = Object.entries(allData)
    .filter(([key]) => key.startsWith(CACHE_KEY_PREFIX))
    .map(([, entry]) => entry);

  const timestamps = cacheEntries
    .map(entry => entry.resolvedAt)
    .filter(Boolean);

  return {
    count: cacheEntries.length,
    oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null
  };
}

// Export for service worker
globalThis.XCPW_Cache = {
  getFromCache,
  saveToCache,
  getOrCreatePlatformData,
  clearCache,
  getCacheStats,
  isCacheValid,
  MANUAL_OVERRIDES,
  PLATFORMS
};
