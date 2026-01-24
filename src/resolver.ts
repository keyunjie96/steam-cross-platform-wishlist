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

// Type for StoreUrls (used for type checking the globalThis value)
type StoreUrlsType = {
  nintendo: (gameName: string) => string;
  playstation: (gameName: string) => string;
  xbox: (gameName: string) => string;
  steamdeck: (gameName: string) => string;
};

const RESOLVER_LOG_PREFIX = '[XCPW Resolver]';
const RESOLVER_DEBUG = false;

// US-specific fallback URLs when direct store links fail validation
const US_FALLBACK_URLS: Record<string, (gameName: string) => string> = {
  nintendo: (name) => `https://www.nintendo.com/us/search/#q=${encodeURIComponent(name)}&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch`,
  playstation: (name) => `https://store.playstation.com/en-us/search/${encodeURIComponent(name)}`,
  xbox: (name) => `https://www.xbox.com/en-US/search?q=${encodeURIComponent(name)}`
};

// Helper to get PLATFORMS - uses cache module in service worker, fallback for tests
function getPlatforms(): Platform[] {
  return globalThis.XCPW_Cache?.PLATFORMS || ['nintendo', 'playstation', 'xbox'];
}

// Use globalThis.XCPW_StoreUrls (set by types.ts at runtime, can be mocked in tests)
function getStoreUrls(): StoreUrlsType {
  return globalThis.XCPW_StoreUrls;
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
 * Validates a store URL by making a HEAD request.
 * Returns true if the URL is accessible (2xx or redirect status).
 */
async function validateStoreUrl(url: string): Promise<boolean> {
  try {
    // Follow redirects to detect error pages (e.g., PlayStation redirects to /error when game unavailable in region)
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow'
    });

    // Check if redirected to an error page (PlayStation pattern: /error?conceptId=...)
    const finalUrl = response.url;
    const isErrorPage = finalUrl.includes('/error?') || finalUrl.includes('/error/');

    // Valid if 2xx response AND not an error page
    const valid = response.ok && !isErrorPage;
    if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} URL validation: ${url} -> finalUrl=${finalUrl}, status=${response.status}, isError=${isErrorPage} (valid: ${valid})`);
    return valid;
  } catch (error) {
    // Network error - URL doesn't exist or is unreachable
    if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} URL validation failed for ${url}:`, error);
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
    ttlDays: 7
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
    ttlDays: 7
  };
}

/**
 * Converts Wikidata result to cache entry format.
 * Validates direct store URLs and falls back to US search if they fail.
 */
async function wikidataResultToCacheEntry(appid: string, gameName: string, wikidataResult: WikidataResult): Promise<CacheEntry> {
  const WikidataClient = globalThis.XCPW_WikidataClient;
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
        if (RESOLVER_DEBUG) console.log(`${RESOLVER_LOG_PREFIX} Direct URL valid for ${platform}: ${officialUrl}`);
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
    ttlDays: 7
  };
}

/**
 * Updates cache entry with new game name if changed
 */
async function updateCachedEntryIfNeeded(cached: CacheEntry, gameName: string): Promise<CacheEntry> {
  if (cached.gameName === gameName) {
    return cached;
  }

  const Cache = globalThis.XCPW_Cache;
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
}

/**
 * Resolves platform availability for a single game.
 * Priority: Cache -> Manual Override -> Wikidata -> Fallback
 */
async function resolvePlatformData(appid: string, gameName: string): Promise<ResolveResult> {
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

    const entry = await wikidataResultToCacheEntry(appid, gameName, wikidataResult);

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${RESOLVER_LOG_PREFIX} Wikidata query failed for ${appid}, will retry later:`, errorMessage);
    const entry = createFallbackEntry(appid, gameName);
    return { entry, fromCache: false };
  }
}

/**
 * Batch resolves platform availability for multiple games.
 * More efficient for bulk operations.
 */
async function batchResolvePlatformData(games: Array<{ appid: string; gameName: string }>): Promise<Map<string, ResolveResult>> {
  const Cache = globalThis.XCPW_Cache;
  const WikidataClient = globalThis.XCPW_WikidataClient;
  const results = new Map<string, ResolveResult>();

  // 1. Check cache for all games
  const uncached: Array<{ appid: string; gameName: string }> = [];
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

      const entry = wikidataResult?.found
        ? await wikidataResultToCacheEntry(appid, gameName, wikidataResult)
        : await wikidataResultToCacheEntry(appid, gameName, {
          found: false,
          platforms: { nintendo: false, playstation: false, xbox: false, steamdeck: false },
          storeIds: { eshop: null, psStore: null, xbox: null, gog: null, epic: null, appStore: null, playStore: null },
          wikidataId: null,
          gameName: gameName
        });

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
globalThis.XCPW_Resolver = {
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
