/**
 * Steam Cross-Platform Wishlist - Resolver
 *
 * Coordinates between Wikidata and the cache system for console platforms.
 * Resolution priority:
 *   1. Cache (if valid)
 *   2. Manual overrides
 *   3. Wikidata (no auth required)
 *   4. Fallback (unknown status with search URLs)
 *
 * Note: Steam Deck data is extracted directly from SSR in the content script,
 * not through this resolver.
 */

import type { Platform, PlatformStatus, CacheEntry, PlatformData, WikidataResult, WikidataStoreIds } from './types';

// Use globalThis for shared values (set by types.ts at runtime)
const CACHE_VERSION = globalThis.SCPW_CacheVersion;

// Type for StoreUrls (used for type checking the globalThis value)
type StoreUrlsType = {
  nintendo: (gameName: string) => string;
  playstation: (gameName: string) => string;
  xbox: (gameName: string) => string;
  steamdeck: (gameName: string) => string;
};

const RESOLVER_LOG_PREFIX = '[SCPW Resolver]';
const RESOLVER_DEBUG = false;

// US-specific fallback URLs when direct store links fail validation
const US_FALLBACK_URLS: Record<string, (gameName: string) => string> = {
  nintendo: (name) => `https://www.nintendo.com/us/search/#q=${encodeURIComponent(name)}&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch`,
  playstation: (name) => `https://store.playstation.com/en-us/search/${encodeURIComponent(name)}`,
  xbox: (name) => `https://www.xbox.com/en-US/search?q=${encodeURIComponent(name)}`
};

// Helper to get PLATFORMS - uses cache module in service worker, fallback for tests
function getPlatforms(): Platform[] {
  return globalThis.SCPW_Cache?.PLATFORMS || ['nintendo', 'playstation', 'xbox'];
}

// Use globalThis.SCPW_StoreUrls (set by types.ts at runtime, can be mocked in tests)
function getStoreUrls(): StoreUrlsType {
  return globalThis.SCPW_StoreUrls;
}

/**
 * Checks if a string looks like a Wikidata QID (e.g., "Q123456")
 */
function isWikidataQID(str: string): boolean {
  return /^Q\d+$/.test(str);
}

/**
 * Gets platform status from Wikidata result
 */
function getPlatformStatus(available: boolean, foundInWikidata: boolean): PlatformStatus {
  if (!foundInWikidata) {
    return 'unknown';
  }
  return available ? 'available' : 'unavailable';
}

/**
 * Creates an empty WikidataResult for games not found in Wikidata.
 */
function createEmptyWikidataResult(gameName: string): WikidataResult {
  return {
    found: false,
    platforms: { nintendo: false, playstation: false, xbox: false, steamdeck: false },
    storeIds: { eshop: null, psStore: null, xbox: null, gog: null, epic: null, appStore: null, playStore: null },
    wikidataId: null,
    gameName
  };
}

/**
 * Validates a store URL by making a HEAD request.
 * Returns true if the URL is accessible (2xx) and not an error page.
 */
async function validateStoreUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const isErrorPage = response.url.includes('/error?') || response.url.includes('/error/');
    const isValid = response.ok && !isErrorPage;
    if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} URL validation: ${url} -> ${response.url}, status=${response.status}, valid=${isValid}`); /* istanbul ignore if */
    return isValid;
  } catch (error) {
    if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} URL validation failed for ${url}:`, error); /* istanbul ignore if */
    return false;
  }
}

/**
 * Creates a platform data object for all platforms
 */
function createPlatformsObject(platformMapper: (platform: Platform) => PlatformData): Record<Platform, PlatformData> {
  const platforms = {} as Record<Platform, PlatformData>;
  for (const platform of getPlatforms()) {
    platforms[platform] = platformMapper(platform);
  }
  return platforms;
}

/**
 * Creates a fallback cache entry when resolution fails.
 * All platforms marked as "unknown".
 */
function createFallbackEntry(appid: string, gameName: string): CacheEntry {
  const StoreUrls = getStoreUrls();
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
    ttlDays: 7,
    cacheVersion: CACHE_VERSION
  };
}

/**
 * Creates a cache entry from manual override data
 */
function createManualOverrideEntry(appid: string, gameName: string, override: Record<Platform, PlatformStatus>): CacheEntry {
  const StoreUrls = getStoreUrls();
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
    ttlDays: 7,
    cacheVersion: CACHE_VERSION
  };
}

/**
 * Converts Wikidata result to cache entry format.
 * Validates direct store URLs and falls back to US search if they fail.
 */
async function wikidataResultToCacheEntry(appid: string, gameName: string, wikidataResult: WikidataResult): Promise<CacheEntry> {
  const WikidataClient = globalThis.SCPW_WikidataClient;
  const StoreUrls = getStoreUrls();

  // Use Wikidata game name only if it's not a QID (fallback for missing labels)
  const wikidataName = wikidataResult.gameName;
  const displayName = (wikidataName && !isWikidataQID(wikidataName)) ? wikidataName : gameName;

  /**
   * Gets the best URL for a platform - validates direct URL, falls back to US search if invalid
   */
  async function getValidatedUrl(platform: Platform): Promise<string> {
    const officialUrl = WikidataClient.getStoreUrl(platform, wikidataResult.storeIds);

    if (officialUrl) {
      // Validate the direct URL
      const isValid = await validateStoreUrl(officialUrl);
      if (isValid) {
        if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Direct URL valid for ${platform}: ${officialUrl}`); /* istanbul ignore if */
        return officialUrl;
      }
      // Direct URL failed validation - use US fallback
      const fallbackUrl = US_FALLBACK_URLS[platform]?.(displayName) || StoreUrls[platform](displayName);
      console.log(`${RESOLVER_LOG_PREFIX} Direct URL invalid for ${platform}, using US fallback`);
      return fallbackUrl;
    }

    // No official URL - use default search URL
    return StoreUrls[platform](displayName);
  }

  // Validate URLs for all platforms in parallel
  const platformPromises = getPlatforms().map(async (platform) => {
    const status = getPlatformStatus(wikidataResult.platforms[platform as keyof typeof wikidataResult.platforms], wikidataResult.found);
    const storeUrl = await getValidatedUrl(platform);
    return { platform, data: { status, storeUrl } };
  });

  const platformResults = await Promise.all(platformPromises);
  const platforms = {} as Record<Platform, PlatformData>;
  for (const { platform, data } of platformResults) {
    platforms[platform] = data;
  }

  return {
    appid,
    gameName: displayName,
    platforms,
    source: wikidataResult.found ? 'wikidata' : 'fallback',
    wikidataId: wikidataResult.wikidataId,
    resolvedAt: Date.now(),
    ttlDays: 7,
    cacheVersion: CACHE_VERSION
  };
}

/**
 * Updates cache entry with new game name if changed
 */
async function updateCachedEntryIfNeeded(cached: CacheEntry, gameName: string): Promise<CacheEntry> {
  if (cached.gameName === gameName) {
    return cached;
  }

  const Cache = globalThis.SCPW_Cache;
  const StoreUrls = getStoreUrls();

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

interface ResolveResult {
  entry: CacheEntry;
  fromCache: boolean;
  isStale?: boolean;
}

/**
 * Background refresh for stale cache entries (fire-and-forget).
 * Fetches fresh data from Wikidata and updates cache for next page load.
 * Preserves existing hltbData since it's still valid (HLTB data rarely changes).
 */
async function refreshStaleEntries(games: Array<{ appid: string; gameName: string }>): Promise<void> {
  const Cache = globalThis.SCPW_Cache;
  const WikidataClient = globalThis.SCPW_WikidataClient;

  console.log(`${RESOLVER_LOG_PREFIX} Background refresh starting for ${games.length} stale entries`);

  try {
    const appIds = games.map(g => g.appid);
    const wikidataResults = await WikidataClient.batchQueryBySteamAppIds(appIds);

    let refreshedCount = 0;
    for (const { appid, gameName } of games) {
      // Get existing entry to check source and preserve hltbData
      const { entry: existingEntry } = await Cache.getFromCacheWithStale(appid);

      // Skip refresh for manual override entries - they should persist until manually changed
      if (existingEntry?.source === 'manual') {
        if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Skipping refresh for manual override: ${appid}`); /* istanbul ignore if */
        continue;
      }

      const wikidataResult = wikidataResults.get(appid);

      const entry = await wikidataResultToCacheEntry(
        appid,
        gameName,
        wikidataResult?.found ? wikidataResult : createEmptyWikidataResult(gameName)
      );

      // Preserve existing hltbData - it's still valid and shouldn't be lost on refresh
      if (existingEntry?.hltbData) {
        entry.hltbData = existingEntry.hltbData;
      }

      await Cache.saveToCache(entry);
      refreshedCount++;
    }

    console.log(`${RESOLVER_LOG_PREFIX} Background refresh complete: ${refreshedCount} entries updated`);
  } catch (error) {
    // Background refresh failed - not critical, next load will try again
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${RESOLVER_LOG_PREFIX} Background refresh failed:`, errorMessage);
  }
}

/**
 * Resolves platform availability for a single game.
 * Priority: Cache -> Manual Override -> Wikidata -> Fallback
 */
async function resolvePlatformData(appid: string, gameName: string): Promise<ResolveResult> {
  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} resolvePlatformData called: appid=${appid}, gameName=${gameName}`); /* istanbul ignore if */

  const Cache = globalThis.SCPW_Cache;
  const WikidataClient = globalThis.SCPW_WikidataClient;

  if (!Cache) {
    console.error(`${RESOLVER_LOG_PREFIX} CRITICAL: SCPW_Cache not available!`);
    throw new Error('Cache module not loaded');
  }
  if (!WikidataClient) {
    console.error(`${RESOLVER_LOG_PREFIX} CRITICAL: SCPW_WikidataClient not available!`);
    throw new Error('WikidataClient module not loaded');
  }

  // 1. Check cache first
  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Checking cache for appid ${appid}`); /* istanbul ignore if */
  const cached = await Cache.getFromCache(appid);
  if (cached) {
    if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Cache HIT for appid ${appid}`); /* istanbul ignore if */
    const entry = await updateCachedEntryIfNeeded(cached, gameName);
    return { entry, fromCache: true };
  }

  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Cache MISS for appid ${appid}, checking manual overrides`); /* istanbul ignore if */

  // 2. Check for manual overrides
  const override = Cache.MANUAL_OVERRIDES?.[appid];
  if (override) {
    const entry = createManualOverrideEntry(appid, gameName, override);
    await Cache.saveToCache(entry);
    console.log(`${RESOLVER_LOG_PREFIX} Using manual override for appid ${appid}`);
    return { entry, fromCache: false };
  }

  // 3. Try Wikidata
  if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Querying Wikidata for appid ${appid}`); /* istanbul ignore if */
  try {
    const wikidataResult = await WikidataClient.queryBySteamAppId(appid);

    /* istanbul ignore if */
    if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Wikidata result for ${appid}:`, {
      found: wikidataResult?.found,
      wikidataId: wikidataResult?.wikidataId,
      platforms: wikidataResult?.platforms
    });

    const entry = await wikidataResultToCacheEntry(appid, gameName, wikidataResult);

    if (wikidataResult.found) {
      await Cache.saveToCache(entry);
      console.log(`${RESOLVER_LOG_PREFIX} Resolved via Wikidata: ${appid}`);
    } else {
      // Game genuinely not in Wikidata - cache this result so we don't keep querying
      if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Wikidata found no match for appid ${appid}`); /* istanbul ignore if */
      await Cache.saveToCache(entry);
    }
    return { entry, fromCache: false };
  } catch (error) {
    // Wikidata query failed (network error, 429, etc.)
    // DON'T cache - allow retry on next page load
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${RESOLVER_LOG_PREFIX} Wikidata query failed for ${appid}, will retry later:`, errorMessage);
    const entry = createFallbackEntry(appid, gameName);
    return { entry, fromCache: false };
  }
}

/**
 * Batch resolves platform availability for multiple games.
 * Uses stale-while-revalidate pattern: returns stale data immediately,
 * triggers background refresh (fire-and-forget) for expired entries.
 */
async function batchResolvePlatformData(games: Array<{ appid: string; gameName: string }>): Promise<Map<string, ResolveResult>> {
  const Cache = globalThis.SCPW_Cache;
  const WikidataClient = globalThis.SCPW_WikidataClient;
  const results = new Map<string, ResolveResult>();

  // 1. Check cache for all games (including stale entries)
  const uncached: Array<{ appid: string; gameName: string }> = [];
  const staleEntries: Array<{ appid: string; gameName: string }> = [];

  for (const { appid, gameName } of games) {
    const { entry, isStale } = await Cache.getFromCacheWithStale(appid);
    if (entry) {
      // Return cached data immediately (even if stale)
      results.set(appid, { entry, fromCache: true, isStale });
      if (isStale) {
        staleEntries.push({ appid, gameName });
      }
    } else {
      uncached.push({ appid, gameName });
    }
  }

  // Log cache status
  const freshCount = games.length - uncached.length - staleEntries.length;
  if (uncached.length === 0 && staleEntries.length === 0) {
    console.log(`${RESOLVER_LOG_PREFIX} All ${games.length} games found in cache (fresh)`);
    return results;
  }

  if (staleEntries.length > 0) {
    console.log(`${RESOLVER_LOG_PREFIX} ${freshCount} fresh, ${staleEntries.length} stale (will refresh in background), ${uncached.length} uncached`);
  } else {
    console.log(`${RESOLVER_LOG_PREFIX} Batch resolving ${uncached.length} games (${freshCount} cached)`);
  }

  // Fire-and-forget background refresh for stale entries
  if (staleEntries.length > 0) {
    refreshStaleEntries(staleEntries).catch(err => {
      console.warn(`${RESOLVER_LOG_PREFIX} Background refresh failed:`, err instanceof Error ? err.message : String(err));
    });
  }

  // 2. Check for manual overrides
  const needsResolution: Array<{ appid: string; gameName: string }> = [];
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

      const entry = await wikidataResultToCacheEntry(
        appid,
        gameName,
        wikidataResult?.found ? wikidataResult : createEmptyWikidataResult(gameName)
      );

      await Cache.saveToCache(entry);
      results.set(appid, { entry, fromCache: false });
    }

    console.log(`${RESOLVER_LOG_PREFIX} Wikidata batch resolved ${needsResolution.length} games`);
  } catch (error) {
    // Batch query failed - DON'T cache to allow retry
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${RESOLVER_LOG_PREFIX} Batch resolution failed, will retry later:`, errorMessage);
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
 */
async function forceRefresh(appid: string, gameName: string): Promise<ResolveResult> {
  const cacheKey = `xcpw_cache_${appid}`;
  await chrome.storage.local.remove(cacheKey);
  return resolvePlatformData(appid, gameName);
}

// Export for service worker
globalThis.SCPW_Resolver = {
  resolvePlatformData,
  batchResolvePlatformData,
  forceRefresh,
  createFallbackEntry
};

// Also export for module imports in tests
export {
  resolvePlatformData,
  batchResolvePlatformData,
  forceRefresh,
  createFallbackEntry,
  wikidataResultToCacheEntry,
  createManualOverrideEntry,
  isWikidataQID,
  getPlatformStatus
};
