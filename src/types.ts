/**
 * Steam Cross-Platform Wishlist - Type Definitions
 *
 * TypeScript type definitions for the extension.
 */

// Platform types
export type Platform = 'nintendo' | 'playstation' | 'xbox' | 'steamdeck';

export type PlatformStatus = 'available' | 'unavailable' | 'unknown';

// HLTB display stat options
export type HltbDisplayStat = 'mainStory' | 'mainExtra' | 'completionist';

// Review score source options
export type ReviewScoreSource = 'opencritic' | 'ign' | 'gamespot' | 'metacritic';

// ============================================================================
// Cache Constants - SINGLE SOURCE OF TRUTH
// ============================================================================
/**
 * Cache schema version - increment when cache format changes.
 * When version mismatches, cached entries are treated as stale.
 * This ensures users get fresh data after extension updates that change data handling.
 *
 * IMPORTANT: This constant is shared across content script and service worker.
 * Both cache.ts (service worker) and content.ts (content script) import this value.
 */
export const CACHE_VERSION = 1;

// ============================================================================
// User Settings - SINGLE SOURCE OF TRUTH
// ============================================================================
// When adding a new setting:
// 1. Add to UserSettings interface
// 2. Add to DEFAULT_USER_SETTINGS with default value
// 3. Add to SETTING_CHECKBOX_IDS mapping
// That's it! options.ts, popup.ts, and content.ts will automatically pick it up.

/**
 * User settings interface - defines all configurable options.
 * This is the single source of truth for settings structure.
 */
export interface UserSettings {
  showNintendo: boolean;
  showPlaystation: boolean;
  showXbox: boolean;
  showSteamDeck: boolean;
  showHltb: boolean;
  hltbDisplayStat: HltbDisplayStat;
  showReviewScores: boolean;
  reviewScoreSource: ReviewScoreSource;
}

/**
 * Default values for all user settings.
 * This is the single source of truth for default values.
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  showNintendo: true,
  showPlaystation: true,
  showXbox: true,
  showSteamDeck: true,
  showHltb: true,
  hltbDisplayStat: 'mainStory',
  showReviewScores: true,
  reviewScoreSource: 'opencritic'
};

/**
 * Mapping from boolean setting keys to their checkbox element IDs in the UI.
 * Only includes boolean settings that have corresponding checkboxes.
 * Non-checkbox settings (like hltbDisplayStat) are handled separately.
 */
export const SETTING_CHECKBOX_IDS: Partial<Record<keyof UserSettings, string>> = {
  showNintendo: 'show-nintendo',
  showPlaystation: 'show-playstation',
  showXbox: 'show-xbox',
  showSteamDeck: 'show-steamdeck',
  showHltb: 'show-hltb',
  showReviewScores: 'show-review-scores'
} as Partial<Record<keyof UserSettings, string>>;

/**
 * Array of all setting keys for iteration.
 * Derived from UserSettings to ensure type safety.
 */
export const USER_SETTING_KEYS = Object.keys(DEFAULT_USER_SETTINGS) as Array<keyof UserSettings>;

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
  hltbData?: HltbData | null;  // Optional HLTB completion time data
  reviewScoreData?: ReviewScoreData | null;  // Optional review score data
  resolvedAt: number;
  ttlDays: number;
  cacheVersion?: number;  // Cache schema version for invalidation on updates
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

export interface GetHltbDataRequest {
  type: 'GET_HLTB_DATA';
  appid: string;
  gameName: string;
}

export interface GetHltbDataBatchRequest {
  type: 'GET_HLTB_DATA_BATCH';
  games: Array<{ appid: string; gameName: string }>;
}

export interface GetHltbDataResponse {
  success: boolean;
  data: HltbData | null;
  error?: string;
}

export interface GetHltbDataBatchResponse {
  success: boolean;
  results: Record<string, HltbData | null>;
  error?: string;
}

export interface GetReviewScoresRequest {
  type: 'GET_REVIEW_SCORES';
  appid: string;
  gameName: string;
}

export interface GetReviewScoresBatchRequest {
  type: 'GET_REVIEW_SCORES_BATCH';
  games: Array<{ appid: string; gameName: string }>;
}

export interface GetReviewScoresResponse {
  success: boolean;
  data: ReviewScoreData | null;
  error?: string;
}

export interface GetReviewScoresBatchResponse {
  success: boolean;
  results: Record<string, ReviewScoreData | null>;
  error?: string;
}

export type ExtensionMessage =
  | GetPlatformDataRequest
  | GetPlatformDataBatchRequest
  | UpdateCacheRequest
  | GetCacheStatsRequest
  | ClearCacheRequest
  | GetHltbDataRequest
  | GetHltbDataBatchRequest
  | GetReviewScoresRequest
  | GetReviewScoresBatchRequest;

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

// Global type declarations for SCPW modules
declare global {
  interface Window {
    SCPW_StoreUrls: typeof StoreUrls;
    SCPW_Icons: Record<Platform, string>;
    SCPW_PlatformInfo: Record<Platform, { name: string; abbr: string; searchLabel: string }>;
    SCPW_StatusInfo: Record<PlatformStatus, { tooltip: (platform: Platform) => string; className: string }>;
    SCPW_SteamDeckTiers: Record<string, { label: string; tooltip: string }>;
    SCPW_CacheVersion: number;
    SCPW_Cache: {
      getFromCache: (appid: string) => Promise<CacheEntry | null>;
      getFromCacheWithStale: (appid: string) => Promise<{ entry: CacheEntry | null; isStale: boolean }>;
      saveToCache: (entry: CacheEntry) => Promise<void>;
      getOrCreatePlatformData: (appid: string, gameName: string) => Promise<{ entry: CacheEntry; fromCache: boolean }>;
      clearCache: () => Promise<void>;
      getCacheStats: () => Promise<{ count: number; oldestEntry: number | null }>;
      isCacheValid: (entry: CacheEntry) => boolean;
      MANUAL_OVERRIDES: Record<string, Record<Platform, PlatformStatus>>;
      PLATFORMS: Platform[];
    };
    SCPW_WikidataClient: {
      queryBySteamAppId: (steamAppId: string) => Promise<WikidataResult>;
      batchQueryBySteamAppIds: (steamAppIds: string[]) => Promise<Map<string, WikidataResult>>;
      getStoreUrl: (platform: string, storeIds: WikidataStoreIds) => string | null;
      testConnection: () => Promise<{ success: boolean; message: string }>;
      STORE_URL_BUILDERS: Record<string, (id: string) => string | null>;
      PLATFORM_QIDS: Record<string, string>;
    };
    SCPW_Resolver: {
      resolvePlatformData: (appid: string, gameName: string) => Promise<{ entry: CacheEntry; fromCache: boolean }>;
      batchResolvePlatformData: (games: Array<{ appid: string; gameName: string }>) => Promise<Map<string, { entry: CacheEntry; fromCache: boolean }>>;
      forceRefresh: (appid: string, gameName: string) => Promise<{ entry: CacheEntry; fromCache: boolean }>;
      createFallbackEntry: (appid: string, gameName: string) => CacheEntry;
    };
    SCPW_SteamDeck: {
      extractDeckDataFromPage: () => Map<string, DeckCategory>;
      waitForDeckData: (maxWaitMs?: number) => Promise<Map<string, DeckCategory>>;
      getDeckStatus: (deckData: Map<string, DeckCategory>, appId: string) => { found: boolean; status: DeckStatus; category: DeckCategory };
      statusToDisplayStatus: (status: DeckStatus) => 'available' | 'unavailable' | 'unknown';
      CATEGORY_MAP: Record<DeckCategory, DeckStatus>;
    };
    SCPW_HltbClient: {
      queryByGameName: (gameName: string, steamAppId?: string) => Promise<HltbSearchResult | null>;
      batchQueryByGameNames: (games: Array<{ appid: string; gameName: string }>) => Promise<Map<string, HltbSearchResult | null>>;
      formatHours: (hours: number) => string;
      normalizeGameName: (name: string) => string;
      calculateSimilarity: (a: string, b: string) => number;
      cleanGameNameForSearch: (name: string) => string;
      registerHeaderRules: () => Promise<void>;
    };
    SCPW_ReviewScoresClient: {
      queryByGameName: (gameName: string) => Promise<ReviewScoreSearchResult | null>;
      batchQueryByGameNames: (games: Array<{ appid: string; gameName: string }>) => Promise<Map<string, ReviewScoreSearchResult | null>>;
      normalizeGameName: (name: string) => string;
      calculateSimilarity: (a: string, b: string) => number;
      formatScore: (score: number) => string;
      getTierColor: (tier: ReviewScoreTier) => string;
    };
    SCPW_ContentTestExports?: {
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
      sendMessageWithRetry: <T>(message: object, maxRetries?: number) => Promise<T | null>;
      MESSAGE_MAX_RETRIES: number;
      MESSAGE_RETRY_DELAY_MS: number;
      findWishlistRow: (link: Element) => Element | null;
      findWishlistItems: (root?: Element | Document) => Element[];
      checkDeckFilterActive: () => boolean;
      clearPendingTimersAndBatches: () => void;
      cleanupAllIcons: () => void;
      lightCleanup: () => void;
      injectedAppIds: Set<string>;
      processedAppIds: Set<string>;
      processingAppIds: Set<string>;
      getBatchDebounceTimer: () => ReturnType<typeof setTimeout> | null;
      getUrlChangeDebounceTimer: () => ReturnType<typeof setTimeout> | null;
      setBatchDebounceTimer: (val: ReturnType<typeof setTimeout> | null) => void;
      URL_CHANGE_DEBOUNCE_MS: number;
      processItem: (item: Element) => Promise<void>;
      waitForInjectionPoint: (item: Element) => Promise<{ container: Element; insertAfter: Element | null } | null>;
      loadUserSettings: () => Promise<void>;
      setSteamDeckData: (val: Map<string, DeckCategory> | null) => void;
      getSteamDeckData: () => Map<string, DeckCategory> | null;
      // Steam Deck refresh exports for coverage testing
      isSameDeckData: (left: Map<string, DeckCategory> | null, right: Map<string, DeckCategory> | null) => boolean;
      refreshIconsFromCache: (reason: string) => void;
      refreshSteamDeckData: (reason: string) => Promise<void>;
      scheduleSteamDeckRefresh: (reason: string) => void;
      markMissingSteamDeckData: (appid: string) => void;
      getEnabledPlatforms: () => Platform[];
      isAnyConsolePlatformEnabled: () => boolean;
      setupSettingsChangeListener: () => void;
      getMissingSteamDeckAppIds: () => Set<string>;
      getSteamDeckRefreshAttempts: () => number;
      setSteamDeckRefreshAttempts: (val: number) => void;
      getCachedEntriesByAppId: () => Map<string, CacheEntry>;
      getUserSettings: () => UserSettings;
      setUserSettings: (val: Partial<UserSettings>) => void;
      getSteamDeckRefreshTimer: () => ReturnType<typeof setTimeout> | null;
      setSteamDeckRefreshTimer: (val: ReturnType<typeof setTimeout> | null) => void;
      STEAM_DECK_REFRESH_DELAYS_MS: number[];
      // HLTB exports for coverage testing
      formatHltbTime: (hours: number) => string;
      createHltbBadge: (hltbData: HltbData) => HTMLElement;
      createHltbLoader: () => HTMLElement;
      queueForHltbResolution: (appid: string, gameName: string, container: HTMLElement) => void;
      processPendingHltbBatch: () => Promise<void>;
      getHltbDataByAppId: () => Map<string, HltbData | null>;
      getPendingHltbItems: () => Map<string, { gameName: string; container: HTMLElement }>;
      getHltbBatchDebounceTimer: () => ReturnType<typeof setTimeout> | null;
      setHltbBatchDebounceTimer: (val: ReturnType<typeof setTimeout> | null) => void;
      HLTB_BATCH_DEBOUNCE_MS: number;
      HLTB_MAX_BATCH_SIZE: number;
      restoreHltbDataFromEntry: (appid: string, entry: CacheEntry) => void;
      getRenderedIconSummary: (container: HTMLElement) => string;
      // Review scores exports for coverage testing
      getTierColor: (tier: ReviewScoreTier) => string;
      getDisplayScoreInfo: (reviewScoreData: ReviewScoreData) => { score: number; sourceName: string; sourceKey: string };
      createReviewScoreBadge: (reviewScoreData: ReviewScoreData) => HTMLElement;
      createReviewScoreLoader: () => HTMLElement;
      queueForReviewScoreResolution: (appid: string, gameName: string, container: HTMLElement) => void;
      processPendingReviewScoreBatch: () => Promise<void>;
      getReviewScoreDataByAppId: () => Map<string, ReviewScoreData | null>;
      getPendingReviewScoreItems: () => Map<string, { gameName: string; container: HTMLElement }>;
      getReviewScoreBatchDebounceTimer: () => ReturnType<typeof setTimeout> | null;
      setReviewScoreBatchDebounceTimer: (val: ReturnType<typeof setTimeout> | null) => void;
      REVIEW_SCORE_BATCH_DEBOUNCE_MS: number;
      REVIEW_SCORE_MAX_BATCH_SIZE: number;
      restoreReviewScoreDataFromEntry: (appid: string, entry: CacheEntry) => void;
    };
    SSR?: {
      renderContext?: {
        queryData?: string;
      };
      loaderData?: string[];
    };
  }
  // eslint-disable-next-line no-var
  var SCPW_StoreUrls: typeof StoreUrls;
  // eslint-disable-next-line no-var
  var SCPW_Icons: Record<Platform, string>;
  // eslint-disable-next-line no-var
  var SCPW_PlatformInfo: Record<Platform, { name: string; abbr: string; searchLabel: string }>;
  // eslint-disable-next-line no-var
  var SCPW_StatusInfo: Record<PlatformStatus, { tooltip: (platform: Platform) => string; className: string }>;
  // eslint-disable-next-line no-var
  var SCPW_SteamDeckTiers: Record<string, { label: string; tooltip: string }>;
  // eslint-disable-next-line no-var
  var SCPW_Cache: Window['SCPW_Cache'];
  // eslint-disable-next-line no-var
  var SCPW_WikidataClient: Window['SCPW_WikidataClient'];
  // eslint-disable-next-line no-var
  var SCPW_Resolver: Window['SCPW_Resolver'];
  // eslint-disable-next-line no-var
  var SCPW_SteamDeck: Window['SCPW_SteamDeck'];
  // eslint-disable-next-line no-var
  var SCPW_HltbClient: Window['SCPW_HltbClient'];
  // eslint-disable-next-line no-var
  var SCPW_ReviewScoresClient: Window['SCPW_ReviewScoresClient'];
  // eslint-disable-next-line no-var
  var SCPW_ContentTestExports: Window['SCPW_ContentTestExports'];
  // eslint-disable-next-line no-var
  var SCPW_UserSettings: {
    DEFAULT_USER_SETTINGS: UserSettings;
    SETTING_CHECKBOX_IDS: Partial<Record<keyof UserSettings, string>>;
    USER_SETTING_KEYS: Array<keyof UserSettings>;
  };
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

// HLTB (How Long To Beat) types
export interface HltbData {
  hltbId: number;        // HLTB game ID for linking
  mainStory: number;    // Hours for main story
  mainExtra: number;    // Hours for main + extras
  completionist: number; // Hours for 100%
  allStyles: number;     // Hours average across all play styles
  steamId: number | null; // Steam app ID from HLTB (for verification)
}

export interface HltbSearchResult {
  hltbId: number;
  gameName: string;
  similarity: number;  // 0-1 match confidence
  data: HltbData;
}

// Individual outlet score (IGN, GameSpot, etc.)
export interface OutletScore {
  outletName: string;       // Display name of the outlet
  score: number;            // Outlet's score (normalized 0-100)
  originalScore?: string;   // Original score format (e.g., "8.5/10", "4/5")
}

// Review Scores types (OpenCritic)
export interface ReviewScoreData {
  openCriticId: number;     // OpenCritic game ID for linking
  score: number;            // Top Critic Average score (0-100)
  tier: ReviewScoreTier;    // Mighty, Strong, Fair, Weak
  numReviews: number;       // Number of critic reviews
  percentRecommended: number; // Percentage of critics recommending (0-100)
  // Individual outlet scores (from OpenCritic's review endpoint)
  outletScores?: {
    ign?: OutletScore;
    gamespot?: OutletScore;
    metacritic?: OutletScore;
  };
}

export type ReviewScoreTier = 'Mighty' | 'Strong' | 'Fair' | 'Weak' | 'Unknown';

export interface ReviewScoreSearchResult {
  openCriticId: number;
  gameName: string;
  similarity: number;  // 0-1 match confidence
  data: ReviewScoreData;
}

// Export globally for content scripts (ES modules not fully supported in Chrome extensions)
// Only set if not already defined (allows mocking in tests)
if (!globalThis.SCPW_StoreUrls) {
  globalThis.SCPW_StoreUrls = StoreUrls;
}
if (!globalThis.SCPW_UserSettings) {
  globalThis.SCPW_UserSettings = {
    DEFAULT_USER_SETTINGS,
    SETTING_CHECKBOX_IDS,
    USER_SETTING_KEYS
  };
}
if (globalThis.SCPW_CacheVersion === undefined) {
  globalThis.SCPW_CacheVersion = CACHE_VERSION;
}
