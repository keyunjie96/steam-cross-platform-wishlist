/**
 * Steam Cross-Platform Wishlist - Cache Module
 *
 * Handles all chrome.storage.local operations for caching platform availability data.
 * This module runs in the background service worker context.
 */

import type { Platform, PlatformStatus, CacheEntry, PlatformData } from './types';

// Use globalThis for StoreUrls (set by types.ts at runtime)
const StoreUrls = globalThis.SCPW_StoreUrls;

const CACHE_DEBUG = false; // Set to true to enable manual test overrides
const CACHE_KEY_PREFIX = 'xcpw_cache_';
const DEFAULT_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PLATFORMS: Platform[] = ['nintendo', 'playstation', 'xbox', 'steamdeck'];

/**
 * Cache schema version - increment when cache format changes.
 * When version mismatches, cached entries are treated as stale (triggers background refresh).
 * This ensures users get fresh data after extension updates that change data handling.
 */
const CACHE_VERSION = 1;

interface PlatformStatusOptions {
  allAvailable?: boolean;
  unavailable?: Platform[];
}

/**
 * Creates a platform availability object
 */
function platformStatus({ allAvailable = false, unavailable = [] }: PlatformStatusOptions = {}): Record<Platform, PlatformStatus> {
  function getStatus(platform: Platform): PlatformStatus {
    if (unavailable.includes(platform)) return 'unavailable';
    if (allAvailable) return 'available';
    return 'unknown';
  }
  return Object.fromEntries(PLATFORMS.map(p => [p, getStatus(p)])) as Record<Platform, PlatformStatus>;
}

/**
 * Manual override map for testing purposes.
 * These appids will show specific platform availability regardless of actual data.
 * Only enabled when CACHE_DEBUG is true - in production, data comes from Wikidata.
 */
const MANUAL_OVERRIDES: Record<string, Record<Platform, PlatformStatus>> = CACHE_DEBUG ? {
  '367520': platformStatus({ allAvailable: true }),   // Hollow Knight
  '1145360': platformStatus({ allAvailable: true }),  // Hades
  '504230': platformStatus({ allAvailable: true }),   // Celeste
  '413150': platformStatus({ allAvailable: true }),   // Stardew Valley
  '632470': platformStatus({ allAvailable: true }),   // Disco Elysium
  '1245620': platformStatus({ allAvailable: true, unavailable: ['nintendo'] }), // Elden Ring
  '1086940': platformStatus({ allAvailable: true, unavailable: ['nintendo'] }), // Baldur's Gate 3
  '1091500': platformStatus({ allAvailable: true, unavailable: ['nintendo'] })  // Cyberpunk 2077
} : {};

/**
 * Gets the cache key for a given appid
 */
function getCacheKey(appid: string): string {
  return `${CACHE_KEY_PREFIX}${appid}`;
}

/**
 * Checks if a cache entry is still valid based on TTL and cache version.
 * Entries with mismatched cache version are treated as stale (triggers background refresh).
 */
function isCacheValid(entry: CacheEntry | null | undefined): boolean {
  if (!entry?.resolvedAt || !entry?.ttlDays) {
    return false;
  }
  // Version mismatch means entry is stale (needs refresh after extension update)
  if (entry.cacheVersion !== CACHE_VERSION) {
    return false;
  }
  const expiresAt = entry.resolvedAt + entry.ttlDays * MS_PER_DAY;
  return Date.now() < expiresAt;
}

/**
 * Creates a cache entry for a given appid and game name.
 * For Stage 1/fallback, uses manual overrides or marks all platforms as "unknown".
 * Stage 2 uses the resolver which creates entries with IGDB data.
 */
function createCacheEntry(appid: string, gameName: string): CacheEntry {
  const override = MANUAL_OVERRIDES[appid];

  const platforms = Object.fromEntries(
    PLATFORMS.map(platform => [platform, {
      status: override?.[platform] || 'unknown',
      storeUrl: StoreUrls[platform](gameName)
    } as PlatformData])
  ) as Record<Platform, PlatformData>;

  return {
    appid,
    gameName,
    platforms,
    source: override ? 'manual' : 'none',
    wikidataId: null,
    resolvedAt: Date.now(),
    ttlDays: DEFAULT_TTL_DAYS,
    cacheVersion: CACHE_VERSION
  };
}

/**
 * Result from cache lookup with staleness information
 */
interface CacheResult {
  entry: CacheEntry | null;
  isStale: boolean;
}

/**
 * Retrieves cached data for a given appid
 */
async function getFromCache(appid: string): Promise<CacheEntry | null> {
  const key = getCacheKey(appid);
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as CacheEntry | undefined;

  if (entry && isCacheValid(entry)) {
    return entry;
  }

  return null;
}

/**
 * Retrieves cached data with staleness information.
 * Returns stale entries (for stale-while-revalidate pattern) along with an isStale flag.
 */
async function getFromCacheWithStale(appid: string): Promise<CacheResult> {
  const key = getCacheKey(appid);
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as CacheEntry | undefined;

  if (!entry) {
    return { entry: null, isStale: false };
  }

  return {
    entry,
    isStale: !isCacheValid(entry)
  };
}

/**
 * Saves data to cache
 */
async function saveToCache(entry: CacheEntry): Promise<void> {
  const key = getCacheKey(entry.appid);
  await chrome.storage.local.set({ [key]: entry });
}

/**
 * Regenerates store URLs for all platforms with a new game name
 */
function updateStoreUrls(entry: CacheEntry, gameName: string): void {
  for (const platform of PLATFORMS) {
    entry.platforms[platform].storeUrl = StoreUrls[platform](gameName);
  }
}

/**
 * Gets or creates platform data for an appid.
 * Returns cached data if available, otherwise creates new entry.
 */
async function getOrCreatePlatformData(appid: string, gameName: string): Promise<{ entry: CacheEntry; fromCache: boolean }> {
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
 */
async function clearCache(): Promise<void> {
  const allData = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(allData).filter(key => key.startsWith(CACHE_KEY_PREFIX));
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}

/**
 * Gets cache statistics
 */
async function getCacheStats(): Promise<{ count: number; oldestEntry: number | null }> {
  const allData = await chrome.storage.local.get(null);
  const cacheEntries = Object.entries(allData)
    .filter(([key]) => key.startsWith(CACHE_KEY_PREFIX))
    .map(([, entry]) => entry as CacheEntry);

  const timestamps = cacheEntries
    .map(entry => entry.resolvedAt)
    .filter(Boolean);

  return {
    count: cacheEntries.length,
    oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null
  };
}

// Export for service worker
globalThis.SCPW_Cache = {
  getFromCache,
  getFromCacheWithStale,
  saveToCache,
  getOrCreatePlatformData,
  clearCache,
  getCacheStats,
  isCacheValid,
  MANUAL_OVERRIDES,
  PLATFORMS
};

// Also export for module imports in tests
export {
  getFromCache,
  getFromCacheWithStale,
  saveToCache,
  getOrCreatePlatformData,
  clearCache,
  getCacheStats,
  isCacheValid,
  MANUAL_OVERRIDES,
  PLATFORMS,
  CACHE_KEY_PREFIX,
  DEFAULT_TTL_DAYS,
  CACHE_VERSION
};

export type { CacheResult };
