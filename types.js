/**
 * Steam Cross-Platform Wishlist - Type Definitions
 *
 * This file contains JSDoc type definitions for type safety without TypeScript.
 * These types are used across the extension for messaging and caching.
 */

/**
 * Platform identifiers
 * @typedef {'nintendo' | 'playstation' | 'xbox'} Platform
 */

/**
 * Platform availability status
 * @typedef {'available' | 'unavailable' | 'unknown'} PlatformStatus
 */

/**
 * Platform data with store link
 * @typedef {Object} PlatformData
 * @property {PlatformStatus} status - Availability status
 * @property {string | null} storeUrl - URL to the store page (search URL for Stage 1)
 */

/**
 * Data source for platform availability
 * @typedef {'igdb' | 'manual' | 'fallback' | 'none'} DataSource
 */

/**
 * Cache entry for a Steam appid
 * @typedef {Object} CacheEntry
 * @property {string} appid - Steam application ID
 * @property {string} gameName - Game name (extracted from Steam or IGDB)
 * @property {Record<Platform, PlatformData>} platforms - Platform availability data
 * @property {DataSource} [source] - Where the data came from (Stage 2+)
 * @property {number | null} [igdbId] - IGDB game ID if resolved via IGDB
 * @property {number} resolvedAt - Unix timestamp when data was resolved
 * @property {number} ttlDays - Time-to-live in days
 */

/**
 * Cache storage structure (keyed by appid)
 * @typedef {Record<string, CacheEntry>} CacheStorage
 */

// ============================================================================
// Message Types
// ============================================================================

/**
 * Request to get platform data for an appid
 * @typedef {Object} GetPlatformDataRequest
 * @property {'GET_PLATFORM_DATA'} type
 * @property {string} appid
 * @property {string} gameName
 */

/**
 * Response with platform data
 * @typedef {Object} GetPlatformDataResponse
 * @property {boolean} success
 * @property {CacheEntry | null} data
 * @property {boolean} fromCache - Whether data was served from cache
 */

/**
 * Request to update cache (from content script observation)
 * @typedef {Object} UpdateCacheRequest
 * @property {'UPDATE_CACHE'} type
 * @property {string} appid
 * @property {string} gameName
 */

/**
 * Request to save Twitch credentials
 * @typedef {Object} SaveCredentialsRequest
 * @property {'SAVE_CREDENTIALS'} type
 * @property {string} clientId
 * @property {string} clientSecret
 */

/**
 * Request to test IGDB connection
 * @typedef {Object} TestConnectionRequest
 * @property {'TEST_CONNECTION'} type
 */

/**
 * Request to clear credentials
 * @typedef {Object} ClearCredentialsRequest
 * @property {'CLEAR_CREDENTIALS'} type
 */

/**
 * Request to get cache statistics
 * @typedef {Object} GetCacheStatsRequest
 * @property {'GET_CACHE_STATS'} type
 */

/**
 * Request to clear cache
 * @typedef {Object} ClearCacheRequest
 * @property {'CLEAR_CACHE'} type
 */

/**
 * Generic message types
 * @typedef {GetPlatformDataRequest | UpdateCacheRequest | SaveCredentialsRequest | TestConnectionRequest | ClearCredentialsRequest | GetCacheStatsRequest | ClearCacheRequest} ExtensionMessage
 */

// ============================================================================
// Store URL Builders
// ============================================================================

/**
 * Builds search URLs for each platform's US store
 */
const StoreUrls = {
  /**
   * Nintendo US eShop search URL
   * @param {string} gameName
   * @returns {string}
   */
  nintendo: (gameName) =>
    `https://www.nintendo.com/us/search/#q=${encodeURIComponent(gameName)}&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch`,

  /**
   * PlayStation US store search URL
   * @param {string} gameName
   * @returns {string}
   */
  playstation: (gameName) =>
    `https://store.playstation.com/en-us/search/${encodeURIComponent(gameName)}`,

  /**
   * Xbox US store search URL
   * @param {string} gameName
   * @returns {string}
   */
  xbox: (gameName) =>
    `https://www.xbox.com/en-US/search?q=${encodeURIComponent(gameName)}`
};

// Export for use in other modules (ES module style won't work in content scripts)
// These are defined globally and imported via manifest
if (typeof window !== 'undefined') {
  window.XCPW_StoreUrls = StoreUrls;
}
if (typeof globalThis !== 'undefined') {
  globalThis.XCPW_StoreUrls = StoreUrls;
}
