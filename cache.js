/**
 * Steam Cross-Platform Wishlist - Cache Module
 *
 * Handles all chrome.storage.local operations for caching platform availability data.
 * This module runs in the background service worker context.
 */

const CACHE_KEY_PREFIX = 'xcpw_cache_';
const DEFAULT_TTL_DAYS = 7;

/**
 * Manual override map for testing purposes.
 * These appids will show specific platform availability regardless of actual data.
 * In production, this would be empty and data would come from actual lookups.
 *
 * Key: Steam appid
 * Value: Object with platform availability
 */
const MANUAL_OVERRIDES = {
  // Hollow Knight - Available on all platforms
  '367520': {
    nintendo: 'available',
    playstation: 'available',
    xbox: 'available'
  },
  // Elden Ring - Available on PlayStation and Xbox, not on Switch
  '1245620': {
    nintendo: 'unavailable',
    playstation: 'available',
    xbox: 'available'
  },
  // Hades - Available on all platforms
  '1145360': {
    nintendo: 'available',
    playstation: 'available',
    xbox: 'available'
  },
  // Celeste - Available on all platforms
  '504230': {
    nintendo: 'available',
    playstation: 'available',
    xbox: 'available'
  },
  // Baldur's Gate 3 - PlayStation and Xbox, not Switch
  '1086940': {
    nintendo: 'unavailable',
    playstation: 'available',
    xbox: 'available'
  },
  // Stardew Valley - Available on all platforms
  '413150': {
    nintendo: 'available',
    playstation: 'available',
    xbox: 'available'
  },
  // Disco Elysium - Available on all platforms
  '632470': {
    nintendo: 'available',
    playstation: 'available',
    xbox: 'available'
  },
  // Cyberpunk 2077 - PlayStation and Xbox only
  '1091500': {
    nintendo: 'unavailable',
    playstation: 'available',
    xbox: 'available'
  }
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
  if (!entry || !entry.resolvedAt || !entry.ttlDays) {
    return false;
  }
  const now = Date.now();
  const expiresAt = entry.resolvedAt + (entry.ttlDays * 24 * 60 * 60 * 1000);
  return now < expiresAt;
}

/**
 * Creates a cache entry for a given appid and game name.
 * For Stage 1, uses manual overrides or marks all platforms as "unknown".
 *
 * @param {string} appid
 * @param {string} gameName
 * @returns {import('./types.js').CacheEntry}
 */
function createCacheEntry(appid, gameName) {
  const override = MANUAL_OVERRIDES[appid];
  const StoreUrls = globalThis.XCPW_StoreUrls;

  /** @type {import('./types.js').CacheEntry} */
  const entry = {
    appid,
    gameName,
    platforms: {
      nintendo: {
        status: override?.nintendo || 'unknown',
        storeUrl: StoreUrls.nintendo(gameName)
      },
      playstation: {
        status: override?.playstation || 'unknown',
        storeUrl: StoreUrls.playstation(gameName)
      },
      xbox: {
        status: override?.xbox || 'unknown',
        storeUrl: StoreUrls.xbox(gameName)
      }
    },
    resolvedAt: Date.now(),
    ttlDays: DEFAULT_TTL_DAYS
  };

  return entry;
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
 * Gets or creates platform data for an appid.
 * Returns cached data if available, otherwise creates new entry.
 *
 * @param {string} appid
 * @param {string} gameName
 * @returns {Promise<{entry: import('./types.js').CacheEntry, fromCache: boolean}>}
 */
async function getOrCreatePlatformData(appid, gameName) {
  // Check cache first
  const cached = await getFromCache(appid);
  if (cached) {
    // Update game name if it changed (user might have renamed in Steam)
    if (cached.gameName !== gameName) {
      cached.gameName = gameName;
      // Regenerate store URLs with new name
      const StoreUrls = globalThis.XCPW_StoreUrls;
      cached.platforms.nintendo.storeUrl = StoreUrls.nintendo(gameName);
      cached.platforms.playstation.storeUrl = StoreUrls.playstation(gameName);
      cached.platforms.xbox.storeUrl = StoreUrls.xbox(gameName);
      await saveToCache(cached);
    }
    return { entry: cached, fromCache: true };
  }

  // Create new entry
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
    .map(([, value]) => value);

  let oldestEntry = null;
  for (const entry of cacheEntries) {
    if (entry.resolvedAt && (!oldestEntry || entry.resolvedAt < oldestEntry)) {
      oldestEntry = entry.resolvedAt;
    }
  }

  return {
    count: cacheEntries.length,
    oldestEntry
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
  MANUAL_OVERRIDES
};
