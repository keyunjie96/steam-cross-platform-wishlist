/**
 * Steam Cross-Platform Wishlist - Type Definitions
 *
 * JSDoc type definitions for type safety without TypeScript.
 */

/** @typedef {'nintendo' | 'playstation' | 'xbox'} Platform */

/** @typedef {'available' | 'unavailable' | 'unknown'} PlatformStatus */

/**
 * @typedef {Object} PlatformData
 * @property {PlatformStatus} status
 * @property {string | null} storeUrl
 */

/** @typedef {'wikidata' | 'manual' | 'fallback' | 'none'} DataSource */

/**
 * @typedef {Object} CacheEntry
 * @property {string} appid
 * @property {string} gameName
 * @property {Record<Platform, PlatformData>} platforms
 * @property {DataSource} [source]
 * @property {string | null} [wikidataId]
 * @property {number} resolvedAt
 * @property {number} ttlDays
 */

/** @typedef {Record<string, CacheEntry>} CacheStorage */

/**
 * @typedef {Object} GetPlatformDataRequest
 * @property {'GET_PLATFORM_DATA'} type
 * @property {string} appid
 * @property {string} gameName
 */

/**
 * @typedef {Object} GetPlatformDataResponse
 * @property {boolean} success
 * @property {CacheEntry | null} data
 * @property {boolean} fromCache
 */

/**
 * @typedef {Object} UpdateCacheRequest
 * @property {'UPDATE_CACHE'} type
 * @property {string} appid
 * @property {string} gameName
 */

/**
 * @typedef {Object} GetCacheStatsRequest
 * @property {'GET_CACHE_STATS'} type
 */

/**
 * @typedef {Object} ClearCacheRequest
 * @property {'CLEAR_CACHE'} type
 */

/** @typedef {GetPlatformDataRequest | UpdateCacheRequest | GetCacheStatsRequest | ClearCacheRequest} ExtensionMessage */

/**
 * Store search URL builders (fallback when no direct link available).
 * Region-agnostic - stores redirect to user's local version.
 */
const StoreUrls = {
  /** @param {string} gameName */
  nintendo: (gameName) =>
    `https://www.nintendo.com/search/#q=${encodeURIComponent(gameName)}&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch`,

  /** @param {string} gameName */
  playstation: (gameName) =>
    `https://store.playstation.com/search/${encodeURIComponent(gameName)}`,

  /** @param {string} gameName */
  xbox: (gameName) =>
    `https://www.xbox.com/search?q=${encodeURIComponent(gameName)}`
};

// Export globally for content scripts (ES modules not supported)
if (typeof globalThis !== 'undefined') {
  globalThis.XCPW_StoreUrls = StoreUrls;
} else if (typeof window !== 'undefined') {
  window.XCPW_StoreUrls = StoreUrls;
}
