/**
 * Steam Cross-Platform Wishlist - Type Definitions
 *
 * TypeScript type definitions for the extension.
 */

// Platform types
export type Platform = 'nintendo' | 'playstation' | 'xbox' | 'steamdeck';

export type PlatformStatus = 'available' | 'unavailable' | 'unknown';

export type DataSource = 'wikidata' | 'manual' | 'fallback' | 'none';

// Platform data structure
export interface PlatformData {
  status: PlatformStatus;
  storeUrl: string | null;
}

// Cache entry structure
export interface CacheEntry {
  appid: string;
  gameName: string;
  platforms: Record<Platform, PlatformData>;
  source?: DataSource;
  wikidataId?: string | null;
  resolvedAt: number;
  ttlDays: number;
}

export type CacheStorage = Record<string, CacheEntry>;

// Message types for chrome.runtime.sendMessage
export interface GetPlatformDataRequest {
  type: 'GET_PLATFORM_DATA';
  appid: string;
  gameName: string;
}

export interface GetPlatformDataBatchRequest {
  type: 'GET_PLATFORM_DATA_BATCH';
  games: Array<{ appid: string; gameName: string }>;
}

export interface GetPlatformDataResponse {
  success: boolean;
  data: CacheEntry | null;
  fromCache: boolean;
  error?: string;
}

export interface GetPlatformDataBatchResponse {
  success: boolean;
  results: Record<string, { data: CacheEntry; fromCache: boolean }>;
  error?: string;
}

export interface UpdateCacheRequest {
  type: 'UPDATE_CACHE';
  appid: string;
  gameName: string;
}

export interface GetCacheStatsRequest {
  type: 'GET_CACHE_STATS';
}

export interface ClearCacheRequest {
  type: 'CLEAR_CACHE';
}

export type ExtensionMessage =
  | GetPlatformDataRequest
  | GetPlatformDataBatchRequest
  | UpdateCacheRequest
  | GetCacheStatsRequest
  | ClearCacheRequest;

// Store URL builders
export const StoreUrls = {
  nintendo: (gameName: string): string =>
    `https://www.nintendo.com/search/#q=${encodeURIComponent(gameName)}&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch`,

  playstation: (gameName: string): string =>
    `https://store.playstation.com/search/${encodeURIComponent(gameName)}`,

  xbox: (gameName: string): string =>
    `https://www.xbox.com/search?q=${encodeURIComponent(gameName)}`,

  steamdeck: (gameName: string): string =>
    `https://store.steampowered.com/search/?term=${encodeURIComponent(gameName)}`
};

// Global type declarations for XCPW modules
declare global {
  interface Window {
    XCPW_StoreUrls: typeof StoreUrls;
    XCPW_Icons: Record<Platform, string>;
    XCPW_PlatformInfo: Record<Platform, { name: string; abbr: string; searchLabel: string }>;
    XCPW_StatusInfo: Record<PlatformStatus, { tooltip: (platform: Platform) => string; className: string }>;
    XCPW_SteamDeckTiers: Record<string, { label: string; tooltip: string }>;
    XCPW_Cache: {
      getFromCache: (appid: string) => Promise<CacheEntry | null>;
      saveToCache: (entry: CacheEntry) => Promise<void>;
      getOrCreatePlatformData: (appid: string, gameName: string) => Promise<{ entry: CacheEntry; fromCache: boolean }>;
      clearCache: () => Promise<void>;
      getCacheStats: () => Promise<{ count: number; oldestEntry: number | null }>;
      isCacheValid: (entry: CacheEntry) => boolean;
      MANUAL_OVERRIDES: Record<string, Record<Platform, PlatformStatus>>;
      PLATFORMS: Platform[];
    };
    XCPW_WikidataClient: {
      queryBySteamAppId: (steamAppId: string) => Promise<WikidataResult>;
      batchQueryBySteamAppIds: (steamAppIds: string[]) => Promise<Map<string, WikidataResult>>;
      getStoreUrl: (platform: string, storeIds: WikidataStoreIds) => string | null;
      testConnection: () => Promise<{ success: boolean; message: string }>;
      STORE_URL_BUILDERS: Record<string, (id: string) => string | null>;
      PLATFORM_QIDS: Record<string, string>;
    };
    XCPW_Resolver: {
      resolvePlatformData: (appid: string, gameName: string) => Promise<{ entry: CacheEntry; fromCache: boolean }>;
      batchResolvePlatformData: (games: Array<{ appid: string; gameName: string }>) => Promise<Map<string, { entry: CacheEntry; fromCache: boolean }>>;
      forceRefresh: (appid: string, gameName: string) => Promise<{ entry: CacheEntry; fromCache: boolean }>;
      createFallbackEntry: (appid: string, gameName: string) => CacheEntry;
    };
    XCPW_SteamDeck: {
      extractDeckDataFromPage: () => Map<string, DeckCategory>;
      waitForDeckData: (maxWaitMs?: number) => Promise<Map<string, DeckCategory>>;
      getDeckStatus: (deckData: Map<string, DeckCategory>, appId: string) => { found: boolean; status: DeckStatus; category: DeckCategory };
      statusToDisplayStatus: (status: DeckStatus) => 'available' | 'unavailable' | 'unknown';
      CATEGORY_MAP: Record<DeckCategory, DeckStatus>;
    };
    XCPW_ContentTestExports?: {
      queueForBatchResolution: (appid: string, gameName: string, iconsContainer: HTMLElement) => void;
      processPendingBatch: () => Promise<void>;
      pendingItems: Map<string, { gameName: string; container: HTMLElement }>;
      updateIconsWithData: (container: HTMLElement, data: CacheEntry) => void;
      createIconsContainer: (appid: string, gameName: string) => HTMLElement;
      createPlatformIcon: (platform: Platform, status: PlatformStatus, gameName: string, storeUrl?: string, tier?: string) => HTMLElement;
      extractAppId: (item: Element) => string | null;
      extractGameName: (item: Element) => string;
      parseSvg: (svgString: string) => SVGElement | null;
      removeLoadingState: (container: HTMLElement) => void;
      findInjectionPoint: (item: Element) => { container: Element; insertAfter: Element | null };
      requestPlatformData: (appid: string, gameName: string) => Promise<GetPlatformDataResponse | null>;
      findWishlistRow: (link: Element) => Element | null;
      findWishlistItems: (root?: Element | Document) => Element[];
      checkDeckFilterActive: () => boolean;
      cleanupAllIcons: () => void;
      injectedAppIds: Set<string>;
      processedAppIds: Set<string>;
      getBatchDebounceTimer: () => ReturnType<typeof setTimeout> | null;
      getUrlChangeDebounceTimer: () => ReturnType<typeof setTimeout> | null;
      setBatchDebounceTimer: (val: ReturnType<typeof setTimeout> | null) => void;
      URL_CHANGE_DEBOUNCE_MS: number;
      processItem: (item: Element) => Promise<void>;
      waitForInjectionPoint: (item: Element) => Promise<{ container: Element; insertAfter: Element | null } | null>;
      loadUserSettings: () => Promise<void>;
      setSteamDeckData: (val: Map<string, DeckCategory> | null) => void;
      getSteamDeckData: () => Map<string, DeckCategory> | null;
    };
    SSR?: {
      renderContext?: {
        queryData?: string;
      };
      loaderData?: string[];
    };
  }
  // eslint-disable-next-line no-var
  var XCPW_StoreUrls: typeof StoreUrls;
  // eslint-disable-next-line no-var
  var XCPW_Icons: Record<Platform, string>;
  // eslint-disable-next-line no-var
  var XCPW_PlatformInfo: Record<Platform, { name: string; abbr: string; searchLabel: string }>;
  // eslint-disable-next-line no-var
  var XCPW_StatusInfo: Record<PlatformStatus, { tooltip: (platform: Platform) => string; className: string }>;
  // eslint-disable-next-line no-var
  var XCPW_SteamDeckTiers: Record<string, { label: string; tooltip: string }>;
  // eslint-disable-next-line no-var
  var XCPW_Cache: Window['XCPW_Cache'];
  // eslint-disable-next-line no-var
  var XCPW_WikidataClient: Window['XCPW_WikidataClient'];
  // eslint-disable-next-line no-var
  var XCPW_Resolver: Window['XCPW_Resolver'];
  // eslint-disable-next-line no-var
  var XCPW_SteamDeck: Window['XCPW_SteamDeck'];
  // eslint-disable-next-line no-var
  var XCPW_ContentTestExports: Window['XCPW_ContentTestExports'];
}

// Wikidata result types
export interface WikidataStoreIds {
  eshop: string | null;
  psStore: string | null;
  xbox: string | null;
  gog: string | null;
  epic: string | null;
  appStore: string | null;
  playStore: string | null;
}

export interface WikidataResult {
  wikidataId: string | null;
  gameName: string;
  found: boolean;
  platforms: {
    nintendo: boolean;
    playstation: boolean;
    xbox: boolean;
    steamdeck: boolean;
  };
  storeIds: WikidataStoreIds;
}

// Steam Deck types
export type DeckCategory = 0 | 1 | 2 | 3;
export type DeckStatus = 'unknown' | 'unsupported' | 'playable' | 'verified';

// Export globally for content scripts (ES modules not fully supported in Chrome extensions)
// Only set if not already defined (allows mocking in tests)
if (typeof globalThis !== 'undefined' && !globalThis.XCPW_StoreUrls) {
  globalThis.XCPW_StoreUrls = StoreUrls;
} else if (typeof window !== 'undefined' && !window.XCPW_StoreUrls) {
  window.XCPW_StoreUrls = StoreUrls;
}
