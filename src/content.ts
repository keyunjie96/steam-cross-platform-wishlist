/**
 * Steam Cross-Platform Wishlist - Content Script
 *
 * Injects platform availability icons into Steam wishlist rows.
 * - Extracts Steam appids from wishlist items
 * - Communicates with background service worker for platform data (via IGDB)
 * - Renders NS/PS/XB icons with appropriate states
 * - Handles infinite scroll with MutationObserver
 */

import type { Platform, PlatformStatus, CacheEntry, DeckCategory, GetPlatformDataResponse, HltbData, GetHltbDataBatchResponse, ReviewScoreData, ReviewScoreTier } from './types';

// Use globalThis for shared values (set by types.ts at runtime)
const CACHE_VERSION = globalThis.SCPW_CacheVersion;

const PROCESSED_ATTR = 'data-scpw-processed';
const ICONS_INJECTED_ATTR = 'data-scpw-icons';
const LOG_PREFIX = '[Steam Cross-Platform Wishlist]';
const DEBUG = true; // Set to true for verbose debugging

/** Set of appids that have been processed to avoid duplicate logging */
const processedAppIds = new Set<string>();

/** Track URL for detecting filter changes (Steam uses client-side routing) */
let lastUrl = location.href;

/** Debounce timer for MutationObserver to batch DOM updates */
let observerDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Timer for debounced URL change handling */
let urlChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Delay before processing after URL change (let React settle) */
const URL_CHANGE_DEBOUNCE_MS = 200;

/**
 * Clears all pending timers and batches.
 * Shared by both light and full cleanup functions.
 */
function clearPendingTimersAndBatches(): void {
  if (batchDebounceTimer) {
    clearTimeout(batchDebounceTimer);
    batchDebounceTimer = null;
  }

  if (hltbBatchDebounceTimer) {
    clearTimeout(hltbBatchDebounceTimer);
    hltbBatchDebounceTimer = null;
  }

  if (reviewScoreBatchDebounceTimer) {
    clearTimeout(reviewScoreBatchDebounceTimer);
    reviewScoreBatchDebounceTimer = null;
  }

  if (steamDeckRefreshTimer) {
    clearTimeout(steamDeckRefreshTimer);
    steamDeckRefreshTimer = null;
  }
  steamDeckRefreshAttempts = 0;

  pendingItems.clear();
  pendingHltbItems.clear();
  pendingReviewScoreItems.clear();
}

/**
 * Light cleanup for URL changes - keeps resolved icons in DOM to prevent blink.
 * Removes containers for pending items (still loading) so they can be reprocessed.
 * This prevents loaders from getting stuck when URL changes mid-batch.
 */
function lightCleanup(): void {
  // Remove containers for pending items - they have loaders that would get stuck
  // Also remove from injectedAppIds so they can be reprocessed
  for (const [appid, { container }] of pendingItems) {
    container.remove();
    injectedAppIds.delete(appid);
  }
  for (const [appid, { container }] of pendingHltbItems) {
    // Only remove HLTB loader, not the whole container (platform icons may be resolved)
    const hltbLoader = container.querySelector('.scpw-hltb-loader');
    if (hltbLoader) hltbLoader.remove();
  }
  for (const [, { container }] of pendingReviewScoreItems) {
    // Only remove review score loader, not the whole container
    const reviewScoreLoader = container.querySelector('.scpw-review-score-loader');
    if (reviewScoreLoader) reviewScoreLoader.remove();
  }

  clearPendingTimersAndBatches();
  if (DEBUG) console.log(`${LOG_PREFIX} Light cleanup complete - pending items removed, resolved icons preserved`); /* istanbul ignore if */
}

/**
 * Full cleanup - removes all injected icons and clears all tracking state.
 * Used when a complete reset is needed.
 */
function cleanupAllIcons(): void {
  clearPendingTimersAndBatches();

  // Remove all icon containers from DOM
  document.querySelectorAll('.scpw-platforms').forEach(el => el.remove());

  // Clear tracking state
  injectedAppIds.clear();
  processedAppIds.clear();
  missingSteamDeckAppIds.clear();
  hltbDataByAppId.clear();
  reviewScoreDataByAppId.clear();

  // Clear processed attributes
  document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => {
    el.removeAttribute(PROCESSED_ATTR);
  });
  document.querySelectorAll(`[${ICONS_INJECTED_ATTR}]`).forEach(el => {
    el.removeAttribute(ICONS_INJECTED_ATTR);
  });

  if (DEBUG) console.log(`${LOG_PREFIX} Cleanup complete - all icons and tracking state cleared`); /* istanbul ignore if */
}

/**
 * Checks if Steam's Deck Verified filter is currently active.
 * When this filter is on, we hide our own Deck icons to avoid redundancy.
 */
function checkDeckFilterActive(): boolean {
  const url = new URL(location.href);
  return url.searchParams.has('deck_filters');
}

/** All available platforms in display order */
const ALL_PLATFORMS: Platform[] = ['nintendo', 'playstation', 'xbox', 'steamdeck'];

// Get centralized settings definitions from types.ts
const { DEFAULT_USER_SETTINGS } = globalThis.SCPW_UserSettings;

/** User settings (loaded from storage) - initialized from centralized defaults */
let userSettings: typeof DEFAULT_USER_SETTINGS = { ...DEFAULT_USER_SETTINGS };

/** Pre-extracted Steam Deck data from page SSR (Map of appId -> category) */
let steamDeckData: Map<string, DeckCategory> | null = null;

/** Cached platform data entries for refreshes */
const cachedEntriesByAppId = new Map<string, CacheEntry>();

/** Cached HLTB data entries */
const hltbDataByAppId = new Map<string, HltbData | null>();

/**
 * Restores HLTB data from a cache entry if not already present.
 * Handles the special case where hltbId === -1 means "searched but not found".
 * NOTE: We intentionally DON'T store "not found" markers in the map - this allows
 * games to be re-queried, which helps when HLTB adds new games or our search improves.
 */
function restoreHltbDataFromEntry(appid: string, entry: CacheEntry): void {
  if (!entry.hltbData || hltbDataByAppId.has(appid)) return;

  // Skip "not found" markers - don't store them in the map
  // This allows games to be re-queried for fresh HLTB data
  if (entry.hltbData.hltbId === -1) {
    return;
  }

  hltbDataByAppId.set(appid, entry.hltbData);
}

/**
 * Restores review score data from a cache entry if not already present.
 * Handles the special case where openCriticId === -1 means "searched but not found".
 * NOTE: We intentionally DON'T store "not found" markers in the map - this allows
 * games to be re-queried, which helps when OpenCritic adds new games or our search improves.
 */
function restoreReviewScoreDataFromEntry(appid: string, entry: CacheEntry): void {
  if (DEBUG) console.log(`${LOG_PREFIX} restoreReviewScore(${appid}): hasData=${!!entry.reviewScoreData}, alreadyInMap=${reviewScoreDataByAppId.has(appid)}`); /* istanbul ignore if */
  if (!entry.reviewScoreData || reviewScoreDataByAppId.has(appid)) return;

  // Skip "not found" markers - don't store them in the map
  // This allows games to be re-queried for fresh OpenCritic data
  if (entry.reviewScoreData.openCriticId === -1) {
    if (DEBUG) console.log(`${LOG_PREFIX} restoreReviewScore(${appid}): skipping "not found" marker (openCriticId=-1)`); /* istanbul ignore if */
    return;
  }

  if (DEBUG) console.log(`${LOG_PREFIX} restoreReviewScore(${appid}): storing valid data, openCriticId=${entry.reviewScoreData.openCriticId}`); /* istanbul ignore if */
  reviewScoreDataByAppId.set(appid, entry.reviewScoreData);
}

/** Pending items waiting for HLTB data resolution */
const pendingHltbItems = new Map<string, { gameName: string; container: HTMLElement }>();

/** Debounce timer for HLTB batch requests */
let hltbBatchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce delay for HLTB batch requests (longer than platform data) */
const HLTB_BATCH_DEBOUNCE_MS = 300;

/** Max games per HLTB batch to prevent service worker timeout (each game ~500ms) */
const HLTB_MAX_BATCH_SIZE = 5;

/** Cached review score entries */
const reviewScoreDataByAppId = new Map<string, ReviewScoreData | null>();

/** Pending items waiting for review score resolution */
const pendingReviewScoreItems = new Map<string, { gameName: string; container: HTMLElement }>();

/** Debounce timer for review score batch requests */
let reviewScoreBatchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce delay for review score batch requests */
const REVIEW_SCORE_BATCH_DEBOUNCE_MS = 300;

/** Max games per review score batch */
const REVIEW_SCORE_MAX_BATCH_SIZE = 5;

/** Steam Deck refresh scheduling */
const STEAM_DECK_REFRESH_DELAYS_MS = [800, 2000, 5000, 10000];
let steamDeckRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let steamDeckRefreshInFlight = false;
let steamDeckRefreshAttempts = 0;
const missingSteamDeckAppIds = new Set<string>();

/**
 * Gets the list of enabled platforms based on user settings and current URL.
 * Hides Steam Deck icons when Steam's native Deck filter is active (deck_filters URL param)
 * to avoid redundancy with Steam's built-in Deck badges.
 */
function getEnabledPlatforms(): Platform[] {
  const isDeckFilterActive = checkDeckFilterActive();

  return ALL_PLATFORMS.filter(platform => {
    switch (platform) {
      case 'nintendo':
        return userSettings.showNintendo;
      case 'playstation':
        return userSettings.showPlaystation;
      case 'xbox':
        return userSettings.showXbox;
      case 'steamdeck':
        // Hide our Deck icons when Steam's Deck filter is active (shows native badges)
        return userSettings.showSteamDeck && !isDeckFilterActive;
      default:
        return true;
    }
  });
}

/**
 * Checks if any console platform (Nintendo, PlayStation, Xbox) is enabled.
 * Used to skip Wikidata fetching when all consoles are disabled.
 */
function isAnyConsolePlatformEnabled(): boolean {
  return userSettings.showNintendo || userSettings.showPlaystation || userSettings.showXbox;
}

/**
 * Loads user settings from chrome.storage.sync
 */
async function loadUserSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get('scpwSettings');
    if (result.scpwSettings) {
      userSettings = { ...userSettings, ...result.scpwSettings };
    }
    if (DEBUG) console.log(`${LOG_PREFIX} Settings loaded: showHltb=${userSettings.showHltb}, showReviewScores=${userSettings.showReviewScores}`); /* istanbul ignore if */
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading settings:`, error);
  }
}

/**
 * Handles settings changes from the options page.
 * Refreshes icons when platforms are re-enabled.
 */
function setupSettingsChangeListener(): void {
  // Guard for test environment where chrome.storage.onChanged may not exist
  if (!chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.scpwSettings) {
      return;
    }

    const oldSettings = changes.scpwSettings.oldValue || {};
    const newSettings = changes.scpwSettings.newValue || {};

    // Update local settings
    userSettings = { ...userSettings, ...newSettings };
    if (DEBUG) console.log(`${LOG_PREFIX} Settings changed:`, { old: oldSettings, new: newSettings }); /* istanbul ignore if */

    // Check if any platform was just enabled
    const platformsJustEnabled: Platform[] = [];

    if (newSettings.showNintendo && !oldSettings.showNintendo) platformsJustEnabled.push('nintendo');
    if (newSettings.showPlaystation && !oldSettings.showPlaystation) platformsJustEnabled.push('playstation');
    if (newSettings.showXbox && !oldSettings.showXbox) platformsJustEnabled.push('xbox');
    if (newSettings.showSteamDeck && !oldSettings.showSteamDeck) platformsJustEnabled.push('steamdeck');

    // Check if any platform was just disabled
    const platformsJustDisabled: Platform[] = [];

    if (!newSettings.showNintendo && oldSettings.showNintendo) platformsJustDisabled.push('nintendo');
    if (!newSettings.showPlaystation && oldSettings.showPlaystation) platformsJustDisabled.push('playstation');
    if (!newSettings.showXbox && oldSettings.showXbox) platformsJustDisabled.push('xbox');
    if (!newSettings.showSteamDeck && oldSettings.showSteamDeck) platformsJustDisabled.push('steamdeck');

    if (platformsJustEnabled.length > 0 || platformsJustDisabled.length > 0) {
      console.log(`${LOG_PREFIX} Platform settings changed - enabled: [${platformsJustEnabled.join(', ')}], disabled: [${platformsJustDisabled.join(', ')}]`);

      // Refresh icons from cache for all visible containers
      // This will show/hide icons based on new settings without re-fetching data
      refreshIconsFromCache('settings-change');

      // Also update ALL containers with loaders (not just pending ones)
      // This handles lazy-loaded games that may have stale references or were just created
      // Use querySelectorAll with filter for browser compatibility (avoids :has() selector)
      const allContainers = document.querySelectorAll<HTMLElement>('.scpw-platforms');
      for (const container of allContainers) {
        // Skip containers without loaders
        if (!container.querySelector('.scpw-loader')) continue;
        const appid = container.getAttribute('data-appid');
        if (!appid) continue;

        // If we have cached data, use it to update the container
        const cachedEntry = cachedEntriesByAppId.get(appid);
        if (cachedEntry) {
          updateIconsWithData(container, cachedEntry, false);  // No loaders for cache hit
          if (DEBUG) console.log(`${LOG_PREFIX} Updated loading container from cache: ${appid}`); /* istanbul ignore if */
        } else if (!isAnyConsolePlatformEnabled() && !newSettings.showSteamDeck) {
          // No cached data and all platforms disabled - just remove loader
          removeLoadingState(container);
          if (DEBUG) console.log(`${LOG_PREFIX} Removed loader (all platforms disabled): ${appid}`); /* istanbul ignore if */
        }
        // Otherwise, loader stays while waiting for batch resolution (normal case)
      }

      // Also update pending items map with fresh container references
      for (const [appid, pendingInfo] of pendingItems) {
        if (!document.body.contains(pendingInfo.container)) {
          // Container is stale - try to find fresh one
          const freshContainer = document.querySelector<HTMLElement>(`.scpw-platforms[data-appid="${appid}"]`);
          if (freshContainer) {
            pendingInfo.container = freshContainer;
          }
        }
      }

      // If Steam Deck was just enabled, fetch Steam Deck data
      if (platformsJustEnabled.includes('steamdeck') && !steamDeckData) {
        const SteamDeck = globalThis.SCPW_SteamDeck;
        if (SteamDeck) {
          SteamDeck.waitForDeckData().then((data: Map<string, DeckCategory>) => {
            if (data.size > 0) {
              steamDeckData = data;
              refreshIconsFromCache('steamdeck-enabled');
            }
          });
        }
      }

      // If console platforms were just enabled and we have no cached data, re-process items
      const consolePlatformsJustEnabled = platformsJustEnabled.filter(p => p !== 'steamdeck');
      if (consolePlatformsJustEnabled.length > 0) {
        // Check if we need to fetch new data (items not in cache)
        const needsFetch = Array.from(cachedEntriesByAppId.keys()).length === 0;
        if (needsFetch) {
          // Clear injected state and reprocess to trigger fetches
          injectedAppIds.clear();
          processWishlistItems();
        }
      }
    }
  });
}

/**
 * Compares two Steam Deck data maps for equality.
 */
function isSameDeckData(
  left: Map<string, DeckCategory> | null,
  right: Map<string, DeckCategory> | null
): boolean {
  if (!left || !right) return false;
  if (left.size !== right.size) return false;
  for (const [appid, category] of left) {
    if (right.get(appid) !== category) return false;
  }
  return true;
}

/**
 * Refreshes icons for containers using cached platform data.
 */
function refreshIconsFromCache(reason: string): void {
  let refreshedCount = 0;

  for (const [appid, data] of cachedEntriesByAppId) {
    const container = document.querySelector<HTMLElement>(`.scpw-platforms[data-appid="${appid}"]`);
    if (!container || !document.body.contains(container)) continue;

    updateIconsWithData(container, data, false);  // No loaders for cache refresh
    refreshedCount++;

    const gameName = data.gameName || container.getAttribute('data-game-name') || 'Unknown Game';
    const iconSummary = getRenderedIconSummary(container);
    console.log(`${LOG_PREFIX} Rendered (deck-refresh): ${appid} - ${gameName} [icons: ${iconSummary}]`);
  }

  if (DEBUG) console.log(`${LOG_PREFIX} Steam Deck refresh (${reason}) updated ${refreshedCount} items`); /* istanbul ignore if */
}

/**
 * Refreshes Steam Deck data and re-renders icons if new data arrives.
 */
async function refreshSteamDeckData(reason: string): Promise<void> {
  if (steamDeckRefreshInFlight) return;
  const SteamDeck = globalThis.SCPW_SteamDeck;
  if (!SteamDeck || !userSettings.showSteamDeck) return;

  steamDeckRefreshInFlight = true;
  try {
    const latest = await SteamDeck.waitForDeckData();
    if (latest.size > 0) {
      const previous = steamDeckData;
      steamDeckData = latest;

      if (missingSteamDeckAppIds.size > 0) {
        for (const appid of missingSteamDeckAppIds) {
          if (latest.has(appid)) {
            missingSteamDeckAppIds.delete(appid);
          }
        }
      }

      if (!isSameDeckData(latest, previous)) {
        refreshIconsFromCache(reason);
      }
    }
  } finally {
    steamDeckRefreshInFlight = false;
    if (steamDeckRefreshAttempts < STEAM_DECK_REFRESH_DELAYS_MS.length && missingSteamDeckAppIds.size > 0) {
      scheduleSteamDeckRefresh(reason);
    }
  }
}

/**
 * Schedules a Steam Deck refresh after a short delay.
 */
function scheduleSteamDeckRefresh(reason: string): void {
  if (!userSettings.showSteamDeck || !globalThis.SCPW_SteamDeck) return;
  if (steamDeckRefreshAttempts >= STEAM_DECK_REFRESH_DELAYS_MS.length) return;
  if (steamDeckRefreshTimer) return;

  const delay = STEAM_DECK_REFRESH_DELAYS_MS[steamDeckRefreshAttempts];
  steamDeckRefreshTimer = setTimeout(() => {
    steamDeckRefreshTimer = null;
    steamDeckRefreshAttempts++;
    void refreshSteamDeckData(reason);
  }, delay);
}

/**
 * Tracks appids missing Steam Deck data and schedules a refresh.
 */
function markMissingSteamDeckData(appid: string): void {
  if (!appid || !userSettings.showSteamDeck || !globalThis.SCPW_SteamDeck) return;

  const wasEmpty = missingSteamDeckAppIds.size === 0;
  missingSteamDeckAppIds.add(appid);

  if (wasEmpty && steamDeckRefreshAttempts >= STEAM_DECK_REFRESH_DELAYS_MS.length) {
    steamDeckRefreshAttempts = 0;
  }

  scheduleSteamDeckRefresh('missing-deck');
}

// Definitions loaded from types.js and icons.js
// Note: StoreUrls is declared in types.js, access via globalThis to avoid redeclaration
const PLATFORM_ICONS = globalThis.SCPW_Icons;
const PLATFORM_INFO = globalThis.SCPW_PlatformInfo;
const STATUS_INFO = globalThis.SCPW_StatusInfo;
const STEAM_DECK_TIERS = globalThis.SCPW_SteamDeckTiers;

// ============================================================================
// Appid Extraction
// ============================================================================

/**
 * Extracts the Steam appid from a wishlist item element.
 * Steam's React-based wishlist uses data-rfd-draggable-id="WishlistItem-{appid}-{index}"
 */
function extractAppId(item: Element): string | null {
  // Primary: data-rfd-draggable-id attribute (most reliable for wishlist items)
  const draggableId = item.getAttribute('data-rfd-draggable-id');
  if (draggableId) {
    const match = draggableId.match(/^WishlistItem-(\d+)-/);
    if (match) return match[1];
  }

  // Fallback: Find link to app page (works on various Steam pages)
  const appLink = item.querySelector('a[href*="/app/"]');
  if (appLink) {
    const match = appLink.getAttribute('href')?.match(/\/app\/(\d+)/);
    if (match) return match[1];
  }

  return null;
}

// ============================================================================
// Filtered View Detection
// ============================================================================

/**
 * Walks up from a link element to find its parent wishlist row.
 * In filtered view, rows don't have data-rfd-draggable-id, so we use heuristics.
 */
function findWishlistRow(link: Element): Element | null {
  let current = link.parentElement;
  let depth = 0;

  while (current && depth < 10) {
    // Row-like elements typically have role="button" or contain platform SVGs
    const isRowLike = current.getAttribute('role') === 'button' ||
                      (current.tagName === 'DIV' && current.querySelector('svg'));

    // Must contain an app link and not be the body
    if (isRowLike && current.querySelector('a[href*="/app/"]') && current !== document.body) {
      return current;
    }
    current = current.parentElement;
    depth++;
  }
  return null;
}

/**
 * Finds all wishlist items needing processing using multiple strategies.
 * Strategy 1: Unfiltered view (data-rfd-draggable-id attribute)
 * Strategy 2: Filtered view (walk up from app links)
 */
function findWishlistItems(root: Element | Document = document): Element[] {
  const items = new Map<string, Element>();

  // Strategy 1: Unfiltered view (existing selector - most reliable)
  root.querySelectorAll(`[data-rfd-draggable-id^="WishlistItem-"]`)
    .forEach(item => {
      const appid = extractAppId(item);
      if (!appid) return;
      const processedAppId = item.getAttribute(PROCESSED_ATTR);
      const hasIcons = !!item.querySelector('.scpw-platforms');
      if (processedAppId === appid && hasIcons) return;
      items.set(appid, item);
    });

  // Strategy 2: Filtered view - find app links and walk up to row
  root.querySelectorAll('a[href*="/app/"]').forEach(link => {
    // Skip links inside our own icons
    if (link.closest('.scpw-platforms')) return;

    const row = findWishlistRow(link);
    if (!row) return;
    const appid = extractAppId(row);
    if (!appid) return;
    const processedAppId = row.getAttribute(PROCESSED_ATTR);
    const hasIcons = !!row.querySelector('.scpw-platforms');
    if (processedAppId === appid && hasIcons) return;
    if (!items.has(appid)) items.set(appid, row);
  });

  return Array.from(items.values());
}

/** Price/discount pattern to filter out non-title text */
const PRICE_PATTERN = /^\$|^€|^£|^\d|^Free|^-\d/;

/**
 * Checks if text looks like a valid game title (not a price or short string)
 */
function isValidGameTitle(text: string | null | undefined): boolean {
  return !!text && text.length > 2 && text.length < 200 && !PRICE_PATTERN.test(text);
}

/**
 * Extracts the game name from a wishlist item element.
 */
function extractGameName(item: Element): string {
  // Primary: Find an app link that has actual text content (not just an image)
  const appLinks = item.querySelectorAll('a[href*="/app/"]');
  for (const link of appLinks) {
    const linkText = link.textContent?.trim();
    if (linkText && linkText.length > 0 && linkText.length < 200) {
      return linkText;
    }
  }

  // Fallback: Extract from URL slug if we found any app link
  if (appLinks.length > 0) {
    const href = appLinks[0].getAttribute('href');
    const match = href?.match(/\/app\/\d+\/([^/?]+)/);
    if (match && match[1].length > 2) {
      return match[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Secondary: Try class-based selectors for title elements
  const titleSelectors = ['[class*="Title"]', '[class*="title"]', '[class*="Name"]', '[class*="name"]'];
  for (const selector of titleSelectors) {
    const el = item.querySelector(selector);
    const text = el?.textContent?.trim();
    if (isValidGameTitle(text)) {
      return text!;
    }
  }

  return 'Unknown Game';
}

// ============================================================================
// SVG Parsing (safe alternative to innerHTML)
// ============================================================================

/**
 * Parses an SVG string into a DOM element safely.
 * Uses DOMParser which is safe for trusted static content.
 */
function parseSvg(svgString: string): SVGElement | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.documentElement;

  // Check for parsing errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    console.error(`${LOG_PREFIX} SVG parsing error`);
    return null;
  }

  return svg as unknown as SVGElement;
}

// ============================================================================
// Icon Injection
// ============================================================================

/**
 * Creates the platform icons container (empty, no loader).
 * Loader is only added when we need to make a network call (cold start).
 * Icons are added dynamically in updateIconsWithData() once data is resolved.
 */
function createIconsContainer(appid: string, gameName: string): HTMLElement {
  const container = document.createElement('span');
  container.className = 'scpw-platforms';
  container.setAttribute('data-appid', appid);
  container.setAttribute('data-game-name', gameName);
  return container;
}

/**
 * Creates a single platform icon element
 */
function createPlatformIcon(
  platform: Platform,
  status: PlatformStatus,
  gameName: string,
  storeUrl?: string,
  tier?: string
): HTMLElement {
  const url = storeUrl || globalThis.SCPW_StoreUrls[platform](gameName);
  // Steam Deck icons are not clickable (just informational)
  // Console platforms: clickable when available or unknown (to search)
  const isClickable = platform !== 'steamdeck' && status !== 'unavailable';
  const icon = document.createElement(isClickable ? 'a' : 'span');

  icon.className = `scpw-platform-icon scpw-${status}`;
  icon.setAttribute('data-platform', platform);

  // Special handling for Steam Deck tier-based tooltip
  if (platform === 'steamdeck' && tier && STEAM_DECK_TIERS && STEAM_DECK_TIERS[tier]) {
    const tierInfo = STEAM_DECK_TIERS[tier];
    icon.setAttribute('title', tierInfo.tooltip);
    icon.setAttribute('data-tier', tier);
  } else {
    icon.setAttribute('title', STATUS_INFO[status].tooltip(platform));
  }

  const svg = parseSvg(PLATFORM_ICONS[platform]);
  if (svg) {
    icon.appendChild(svg);
  }

  if (isClickable) {
    (icon as HTMLAnchorElement).setAttribute('href', url);
    (icon as HTMLAnchorElement).setAttribute('target', '_blank');
    (icon as HTMLAnchorElement).setAttribute('rel', 'noopener noreferrer');
  }

  return icon;
}

/**
 * Formats HLTB hours for display (e.g., "12h" or "100h+")
 */
function formatHltbTime(hours: number): string {
  if (!hours || hours <= 0) return '';
  // Round to whole number if >= 10, otherwise show one decimal
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

/**
 * Creates an HLTB time badge element.
 * Shows only the main story time on the badge (clean, minimal).
 * Full stats available in tooltip on hover.
 */
function createHltbBadge(hltbData: HltbData): HTMLElement {
  const isClickable = hltbData.hltbId > 0;

  if (DEBUG) console.log(`${LOG_PREFIX} createHltbBadge: hltbId=${hltbData.hltbId}, isClickable=${isClickable}`); /* istanbul ignore if */

  // Create link or span depending on whether we have an HLTB ID
  const badge = document.createElement(isClickable ? 'a' : 'span') as HTMLAnchorElement | HTMLSpanElement;
  badge.className = 'scpw-hltb-badge';

  if (isClickable && badge instanceof HTMLAnchorElement) {
    badge.href = `https://howlongtobeat.com/game/${hltbData.hltbId}`;
    badge.target = '_blank';
    badge.rel = 'noopener noreferrer';
  }

  // Format times
  const mainTime = formatHltbTime(hltbData.mainStory);
  const extraTime = formatHltbTime(hltbData.mainExtra);
  const completionistTime = formatHltbTime(hltbData.completionist);

  // Display stat based on user preference, with fallbacks
  const displayStat = userSettings.hltbDisplayStat || 'mainStory';
  let displayTime = '';

  if (displayStat === 'mainStory' && hltbData.mainStory > 0) {
    displayTime = mainTime;
  } else if (displayStat === 'mainExtra' && hltbData.mainExtra > 0) {
    displayTime = extraTime;
  } else if (displayStat === 'completionist' && hltbData.completionist > 0) {
    displayTime = completionistTime;
  }

  // Fallback: show any available stat if preferred one is 0
  if (!displayTime) {
    if (hltbData.mainStory > 0) {
      displayTime = mainTime;
    } else if (hltbData.mainExtra > 0) {
      displayTime = extraTime;
    } else if (hltbData.completionist > 0) {
      displayTime = completionistTime;
    } else {
      displayTime = '?h';
    }
  }

  badge.textContent = displayTime;

  // Tooltip with full breakdown (visible on hover)
  const tooltipParts: string[] = [];
  if (hltbData.mainStory > 0) {
    tooltipParts.push(`Main Story: ${mainTime}`);
  }
  if (hltbData.mainExtra > 0) {
    tooltipParts.push(`Main + Extras: ${extraTime}`);
  }
  if (hltbData.completionist > 0) {
    tooltipParts.push(`Completionist: ${completionistTime}`);
  }

  if (isClickable) {
    tooltipParts.push('Click to view on HLTB');
  }

  const hasAnyTime = hltbData.mainStory > 0 || hltbData.mainExtra > 0 || hltbData.completionist > 0;
  const tooltip = hasAnyTime ? tooltipParts.join('\n') : 'How Long To Beat: Unknown';
  badge.setAttribute('title', tooltip);
  badge.setAttribute('aria-label', tooltip);

  return badge;
}

/**
 * Creates an HLTB loading indicator element.
 * Shown while HLTB data is being fetched.
 */
function createHltbLoader(): HTMLElement {
  const loader = document.createElement('span');
  loader.className = 'scpw-hltb-loader';
  loader.textContent = '···';
  loader.setAttribute('title', 'Loading completion time...');
  loader.setAttribute('aria-label', 'Loading completion time');
  return loader;
}

/**
 * Gets the display color for a review tier
 */
function getTierColor(tier: ReviewScoreTier): string {
  switch (tier) {
    case 'Mighty':
      return '#66cc33'; // Green
    case 'Strong':
      return '#99cc33'; // Yellow-green
    case 'Fair':
      return '#ffcc33'; // Yellow
    case 'Weak':
      return '#ff6633'; // Orange-red
    default:
      return '#888888'; // Gray for unknown
  }
}

/**
 * Gets the display score and source name based on user settings.
 * Returns null if the selected outlet score is not available (no fallback).
 */
function getDisplayScoreInfo(reviewScoreData: ReviewScoreData): {
  score: number;
  displayScore: string;  // Original format for display (e.g., "9.5" for IGN)
  sourceName: string;
  sourceKey: string;
  reviewUrl?: string;
} | null {
  const source = userSettings.reviewScoreSource || 'opencritic';

  // OpenCritic is the default - always available if we have review data
  if (source === 'opencritic') {
    return {
      score: reviewScoreData.score,
      displayScore: Math.round(reviewScoreData.score).toString(),
      sourceName: 'OpenCritic',
      sourceKey: 'opencritic'
    };
  }

  // Try to get the selected outlet score - no fallback if unavailable
  if (reviewScoreData.outletScores) {
    const outletScore = reviewScoreData.outletScores[source as 'ign' | 'gamespot'];
    if (outletScore && outletScore.score > 0) {
      // Calculate display score based on original scale
      // If scaleBase is 10 (IGN/GameSpot), divide by 10 to show "7.3" instead of "73"
      // If scaleBase is 100 or not set, show as-is
      const scaleBase = outletScore.scaleBase || 100;
      const displayScore = scaleBase === 10
        ? (outletScore.score / 10).toFixed(1)
        : Math.round(outletScore.score).toString();
      return {
        score: outletScore.score,  // Normalized score for color calculation
        displayScore: displayScore,
        sourceName: outletScore.outletName,
        sourceKey: source,
        reviewUrl: outletScore.reviewUrl
      };
    }
  }

  // Selected outlet not available - return null (don't show badge)
  return null;
}

/**
 * Creates a review score badge element.
 * Shows the score from the user's selected source (OpenCritic, IGN, or GameSpot).
 * Returns null if the selected source is not available (no fallback).
 */
function createReviewScoreBadge(reviewScoreData: ReviewScoreData): HTMLElement | null {
  const displayInfo = getDisplayScoreInfo(reviewScoreData);

  // If selected outlet is not available, don't show badge
  if (!displayInfo) {
    return null;
  }

  // Determine the URL to link to
  // Use outlet's reviewUrl if available, otherwise fall back to OpenCritic game page
  const reviewUrl = displayInfo.reviewUrl || reviewScoreData.openCriticUrl || null;
  const isClickable = !!reviewUrl;

  const badge = document.createElement(isClickable ? 'a' : 'span') as HTMLAnchorElement | HTMLSpanElement;
  badge.className = 'scpw-review-score-badge';

  if (isClickable && badge instanceof HTMLAnchorElement) {
    badge.href = reviewUrl;
    badge.target = '_blank';
    badge.rel = 'noopener noreferrer';
  }

  // Display the formatted score (e.g., "9.5" for IGN, "95" for OpenCritic)
  badge.textContent = displayInfo.displayScore;

  // Color based on normalized score (always 0-100 scale for consistent coloring)
  const tierColor = getTierColor(reviewScoreData.tier);
  badge.style.setProperty('--tier-color', tierColor);

  // Build tooltip
  const tooltipParts: string[] = [];
  tooltipParts.push(`${displayInfo.sourceName}: ${displayInfo.displayScore}`);

  // Show other available scores in tooltip
  if (displayInfo.sourceKey !== 'opencritic') {
    tooltipParts.push(`OpenCritic: ${Math.round(reviewScoreData.score)}`);
  }
  if (reviewScoreData.outletScores) {
    const outlets = ['ign', 'gamespot'] as const;
    for (const outlet of outlets) {
      if (outlet === displayInfo.sourceKey) continue;
      const outletScore = reviewScoreData.outletScores[outlet];
      if (outletScore && outletScore.score > 0) {
        // Show score in original scale (divide by 10 for 10-point outlets)
        const scaleBase = outletScore.scaleBase || 100;
        const displayVal = scaleBase === 10
          ? (outletScore.score / 10).toFixed(1)
          : Math.round(outletScore.score).toString();
        tooltipParts.push(`${outletScore.outletName}: ${displayVal}`);
      }
    }
  }

  tooltipParts.push(`Tier: ${reviewScoreData.tier}`);
  if (reviewScoreData.numReviews > 0) {
    tooltipParts.push(`Based on ${reviewScoreData.numReviews} critic reviews`);
  }
  if (isClickable) {
    // Tooltip should reflect actual destination: outlet's review if available, otherwise OpenCritic
    const siteName = displayInfo.reviewUrl ? displayInfo.sourceName : 'OpenCritic';
    tooltipParts.push(`Click to view on ${siteName}`);
  }

  const tooltip = tooltipParts.join('\n');
  badge.setAttribute('title', tooltip);
  badge.setAttribute('aria-label', tooltip);

  return badge;
}

/**
 * Creates a review score loading indicator element.
 */
function createReviewScoreLoader(): HTMLElement {
  const loader = document.createElement('span');
  loader.className = 'scpw-review-score-loader';
  loader.textContent = '···';
  loader.setAttribute('title', 'Loading review score...');
  loader.setAttribute('aria-label', 'Loading review score');
  return loader;
}

/**
 * Updates the icons container with platform data from cache.
 * Dynamically adds icons for available platforms (none exist initially).
 * Steam Deck icons are fetched separately from Steam's store pages.
 * Only shows icons for platforms where the game is available:
 * - available: Full opacity, clickable - opens store page
 * - unavailable/unknown: Hidden (not displayed)
 *
 * @param showLoaders - If false, don't show loading spinners (use for cache-hit renders)
 */
function updateIconsWithData(container: HTMLElement, data: CacheEntry, showLoaders: boolean = true): void {
  const gameName = data.gameName || container.getAttribute('data-game-name') || '';
  const appid = container.getAttribute('data-appid');
  const enabledPlatforms = getEnabledPlatforms();
  const iconsToAdd: HTMLElement[] = [];

  // Reset previous icons to keep updates idempotent
  container.querySelectorAll('.scpw-platform-icon, .scpw-separator, .scpw-hltb-badge, .scpw-hltb-loader, .scpw-review-score-badge, .scpw-review-score-loader').forEach(el => el.remove());

  // Get Steam Deck client if available
  const SteamDeck = globalThis.SCPW_SteamDeck;

  for (const platform of enabledPlatforms) {
    // Special handling for Steam Deck - use pre-extracted SSR data
    if (platform === 'steamdeck') {
      if (!SteamDeck || !appid) {
        continue;
      }

      if (!steamDeckData) {
        markMissingSteamDeckData(appid);
        continue;
      }

      const deckResult = SteamDeck.getDeckStatus(steamDeckData, appid);
      if (!deckResult.found) {
        markMissingSteamDeckData(appid);
      } else {
        missingSteamDeckAppIds.delete(appid);
      }
      const displayStatus = SteamDeck.statusToDisplayStatus(deckResult.status);

      // Skip unknown/unsupported Steam Deck games
      if (displayStatus !== 'unknown') {
        const icon = createPlatformIcon(platform, displayStatus, gameName, undefined, deckResult.status);
        iconsToAdd.push(icon);
      }
      continue;
    }

    // Console platforms - use Wikidata data
    const platformData = data.platforms[platform];
    const status = platformData?.status || 'unknown';
    const storeUrl = platformData?.storeUrl || undefined;

    // Only add icons for available platforms
    if (status === 'available') {
      const icon = createPlatformIcon(platform, status, gameName, storeUrl);
      iconsToAdd.push(icon);
    }
  }

  // Remove the loader
  const loader = container.querySelector('.scpw-loader');
  if (loader) loader.remove();

  // Get HLTB data if available
  const hltbKnown = appid ? hltbDataByAppId.has(appid) : false;
  const hltbData = hltbKnown && appid ? hltbDataByAppId.get(appid) : null;
  const hasHltbTime = hltbData && (hltbData.mainStory > 0 || hltbData.mainExtra > 0 || hltbData.completionist > 0);
  const showHltbBadge = userSettings.showHltb && hasHltbTime;
  // Only show loader if showLoaders is true (i.e., network call is happening)
  const showHltbLoader = showLoaders && userSettings.showHltb && !hltbKnown;

  // Get review score data if available
  const reviewScoreKnown = appid ? reviewScoreDataByAppId.has(appid) : false;
  const reviewScoreData = reviewScoreKnown && appid ? reviewScoreDataByAppId.get(appid) : null;
  const hasReviewScore = reviewScoreData && reviewScoreData.score > 0;
  const showReviewScoreBadge = userSettings.showReviewScores && hasReviewScore;
  // Only show loader if showLoaders is true (i.e., network call is happening)
  const showReviewScoreLoader = showLoaders && userSettings.showReviewScores && !reviewScoreKnown;

  // Only add separator and icons if we have visible icons, badges, or loaders
  if (iconsToAdd.length > 0 || showHltbBadge || showHltbLoader || showReviewScoreBadge || showReviewScoreLoader) {
    const separator = document.createElement('span');
    separator.className = 'scpw-separator';
    container.appendChild(separator);

    for (const icon of iconsToAdd) {
      container.appendChild(icon);
    }

    // Add HLTB badge or loader after platform icons
    if (showHltbBadge && hltbData) {
      const hltbBadge = createHltbBadge(hltbData);
      container.appendChild(hltbBadge);
    } else if (showHltbLoader) {
      container.appendChild(createHltbLoader());
    }

    // Add review score badge or loader after HLTB
    // Badge is null if selected outlet (IGN/GameSpot) is not available for this game
    if (showReviewScoreBadge && reviewScoreData) {
      const reviewScoreBadge = createReviewScoreBadge(reviewScoreData);
      if (reviewScoreBadge) {
        container.appendChild(reviewScoreBadge);
      }
    } else if (showReviewScoreLoader) {
      container.appendChild(createReviewScoreLoader());
    }
  }
}

/**
 * Creates a concise log string describing rendered icons for a container.
 */
function getRenderedIconSummary(container: HTMLElement): string {
  const icons = Array.from(container.querySelectorAll('.scpw-platform-icon'));
  if (icons.length === 0) return 'none';

  const summaries = icons.map(icon => {
    const platform = icon.getAttribute('data-platform') || 'unknown';
    const tier = icon.getAttribute('data-tier');
    if (tier) return `${platform}:${tier}`;

    let status: string;
    if (icon.classList.contains('scpw-available')) {
      status = 'available';
    } else if (icon.classList.contains('scpw-unavailable')) {
      status = 'unavailable';
    } else {
      status = 'unknown';
    }
    return `${platform}:${status}`;
  });

  return summaries.join(', ');
}

/**
 * Removes loading state from container when data fetch fails.
 * Since we now use a single loader, this just removes the loader element.
 * The container will be empty (no icons shown) on failure.
 */
function removeLoadingState(container: HTMLElement): void {
  const loader = container.querySelector('.scpw-loader');
  if (loader) loader.remove();
}

/** Steam platform icon title patterns */
const STEAM_PLATFORM_TITLES = ['Windows', 'macOS', 'Linux', 'SteamOS', 'Steam Deck', 'VR'];

/**
 * Checks if an element is a valid child container of the item (not item itself or parent)
 */
function isValidContainer(item: Element, el: Element | null): boolean {
  return !!el && item.contains(el) && el !== item && !el.contains(item);
}

interface InjectionPoint {
  container: Element;
  insertAfter: Element | null;
}

/**
 * Finds the best injection point for our icons (next to OS icons)
 */
function findInjectionPoint(item: Element): InjectionPoint {
  // Primary: Find Steam platform icons by their title attributes
  // CSS order:9999 ensures we display after Steam icons regardless of DOM order
  const platformIcon = item.querySelector('span[title]');
  if (platformIcon) {
    const title = platformIcon.getAttribute('title') || '';
    const isSteamIcon = STEAM_PLATFORM_TITLES.some(t => title.includes(t)) || platformIcon.querySelector('svg');
    if (isSteamIcon) {
      const group = platformIcon.parentElement;
      if (isValidContainer(item, group)) {
        return { container: group!, insertAfter: null };
      }
    }
  }

  // Secondary: Find the largest SVG icon group (platform icons are typically grouped)
  const svgIcons = item.querySelectorAll('svg:not(.scpw-platforms svg)');
  const groupCounts = new Map<Element, { count: number; lastWrapper: Element }>();
  for (const svg of svgIcons) {
    if (svg.closest('.scpw-platforms')) continue;
    const parent = svg.parentElement;
    if (!parent) continue;
    const group = parent.parentElement || parent;
    if (!isValidContainer(item, group)) continue;
    const info = groupCounts.get(group) || { count: 0, lastWrapper: parent };
    info.count++;
    info.lastWrapper = parent;
    groupCounts.set(group, info);
  }

  let bestGroup: Element | null = null;
  let bestInfo: { count: number; lastWrapper: Element } | null = null;
  for (const [group, info] of groupCounts) {
    if (!bestInfo || info.count > bestInfo.count) {
      bestGroup = group;
      bestInfo = info;
    }
  }
  if (bestGroup && bestInfo) {
    return { container: bestGroup, insertAfter: bestInfo.lastWrapper };
  }

  // Fallback: append to item itself
  return { container: item, insertAfter: null };
}

// ============================================================================
// Message Passing
// ============================================================================

/** Retry configuration for service worker messages */
const MESSAGE_MAX_RETRIES = 3;
const MESSAGE_RETRY_DELAY_MS = 100;

/**
 * Sends a message to the service worker with retry logic.
 * MV3 service workers can be terminated and may not respond on first attempt.
 * Retries with exponential backoff to handle connection failures.
 */
async function sendMessageWithRetry<T>(message: object, maxRetries = MESSAGE_MAX_RETRIES): Promise<T | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a connection error (service worker not ready or context invalid)
      const isConnectionError = lastError.message.includes('Could not establish connection') ||
                                lastError.message.includes('Receiving end does not exist') ||
                                lastError.message.includes('Extension context invalidated');

      if (isConnectionError && attempt < maxRetries) {
        // Wait before retry with exponential backoff
        const delay = MESSAGE_RETRY_DELAY_MS * Math.pow(2, attempt);
        if (DEBUG) console.log(`${LOG_PREFIX} Message retry ${attempt + 1}/${maxRetries} after ${delay}ms`); /* istanbul ignore if */
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Non-connection error or max retries reached
      throw lastError;
    }
  }

  // This should never be reached - the loop always returns or throws
  throw lastError ?? new Error('Unexpected state in sendMessageWithRetry');
}

/**
 * Requests platform data from background service worker (legacy single-item)
 */
async function requestPlatformData(appid: string, gameName: string): Promise<GetPlatformDataResponse | null> {
  try {
    const response = await sendMessageWithRetry<GetPlatformDataResponse>({
      type: 'GET_PLATFORM_DATA',
      appid,
      gameName
    });

    if (response?.success && response.data) {
      cachedEntriesByAppId.set(appid, response.data);
      return response;
    }
    return null;
  } catch {
    // Service worker may be inactive - fail silently
    return null;
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

/** Pending items waiting for batch resolution */
const pendingItems = new Map<string, { gameName: string; container: HTMLElement }>();

/** Debounce timer for batch requests */
let batchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce delay in ms - wait for more items before sending batch */
const BATCH_DEBOUNCE_MS = 100;

/**
 * Queues an item for batch platform data resolution.
 * Uses debouncing to collect multiple items before sending a single batch request.
 */
function queueForBatchResolution(appid: string, gameName: string, iconsContainer: HTMLElement): void {
  pendingItems.set(appid, { gameName, container: iconsContainer });

  // Reset debounce timer
  if (batchDebounceTimer) {
    clearTimeout(batchDebounceTimer);
  }

  batchDebounceTimer = setTimeout(() => {
    processPendingBatch();
  }, BATCH_DEBOUNCE_MS);
}

/**
 * Processes all pending items in a single batch request
 */
async function processPendingBatch(): Promise<void> {
  if (pendingItems.size === 0) {
    return;
  }

  // Collect all pending items
  const games: Array<{ appid: string; gameName: string }> = [];
  const containerMap = new Map<string, { container: HTMLElement; gameName: string }>();

  for (const [appid, { gameName, container }] of pendingItems) {
    games.push({ appid, gameName });
    containerMap.set(appid, { container, gameName });
  }

  // Clear pending items before async operation
  pendingItems.clear();
  batchDebounceTimer = null;

  // Skip Wikidata fetch ONLY if all console platforms are disabled AND HLTB is disabled
  // When HLTB is enabled, we still need Wikidata to get English game names for HLTB matching
  // (Steam may show translated names that HLTB won't recognize)
  if (!isAnyConsolePlatformEnabled() && !userSettings.showHltb) {
    if (DEBUG) console.log(`${LOG_PREFIX} Skipping batch request - all console platforms and HLTB disabled`); /* istanbul ignore if */
    for (const [appid, { container, gameName }] of containerMap) {
      // Create a minimal cache entry with no console platform data
      const minimalEntry: CacheEntry = {
        appid,
        gameName,
        platforms: {
          nintendo: { status: 'unknown', storeUrl: '' },
          playstation: { status: 'unknown', storeUrl: '' },
          xbox: { status: 'unknown', storeUrl: '' },
          steamdeck: { status: 'unknown', storeUrl: '' }
        },
        source: 'fallback',
        wikidataId: null,
        resolvedAt: Date.now(),
        ttlDays: 7
      };

      // Save to in-memory cache for HLTB re-rendering
      cachedEntriesByAppId.set(appid, minimalEntry);

      // Always call updateIconsWithData - it handles removing the loader
      // and will show Steam Deck icons if enabled and data is available
      updateIconsWithData(container, minimalEntry, false);  // No loaders - platforms disabled
    }
    return;
  }

  if (DEBUG) console.log(`${LOG_PREFIX} Sending batch request for ${games.length} games`); /* istanbul ignore if */

  try {
    const response = await sendMessageWithRetry<{ success: boolean; results: Record<string, { data: CacheEntry; fromCache: boolean }> }>({
      type: 'GET_PLATFORM_DATA_BATCH',
      games
    });

    if (response?.success && response.results) {
      // Update icons for each result
      for (const [appid, result] of Object.entries(response.results) as Array<[string, { data: CacheEntry; fromCache: boolean }]>) {
        const itemInfo = containerMap.get(appid);
        if (!itemInfo) continue;

        const { container, gameName } = itemInfo;

        // Always save data to in-memory cache first, even if container is stale
        // This ensures data is available for cache-reuse when game reappears
        if (result.data) {
          cachedEntriesByAppId.set(appid, result.data);
          // Restore HLTB and review score data if present in cache entry
          restoreHltbDataFromEntry(appid, result.data);
          restoreReviewScoreDataFromEntry(appid, result.data);
        }

        // BUG-13 FIX: Update ALL containers for this appid, not just the one in containerMap
        // React's virtualization can create multiple containers when items are re-rendered
        // while a batch request is in flight, causing duplicate containers with ghost loaders
        const allContainersForAppid = document.querySelectorAll<HTMLElement>(`.scpw-platforms[data-appid="${appid}"]`);

        if (allContainersForAppid.length === 0) {
          if (DEBUG) console.log(`${LOG_PREFIX} No containers found for ${appid}, data cached for reuse`); /* istanbul ignore if */
          continue;
        }

        // Update all containers for this appid
        let updatedCount = 0;
        for (const targetContainer of allContainersForAppid) {
          if (result.data) {
            updateIconsWithData(targetContainer, result.data);
            updatedCount++;
          } else {
            // No data available - remove loading state
            removeLoadingState(targetContainer);
          }
        }

        if (result.data) {
          const source = result.fromCache ? 'cache' : 'new';
          const iconSummary = getRenderedIconSummary(allContainersForAppid[0]);
          const containerNote = allContainersForAppid.length > 1 ? ` (${updatedCount} containers)` : '';
          console.log(`${LOG_PREFIX} Rendered (${source}): ${appid} - ${gameName} [icons: ${iconSummary}]${containerNote}`);
        /* istanbul ignore else */
        } else if (DEBUG) {
          console.log(`${LOG_PREFIX} No data for appid ${appid}, removed loading state`);
        }
      }
    } else {
      // Batch request failed - keep icons as unknown (still link to store search)
      console.warn(`${LOG_PREFIX} Batch request failed`);
      for (const { container } of containerMap.values()) {
        removeLoadingState(container);
      }
    }
  } catch (error) {
    // Service worker may be inactive - keep icons as unknown
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG_PREFIX} Batch request error:`, errorMessage);
    for (const { container } of containerMap.values()) {
      removeLoadingState(container);
    }
  }

  // Queue HLTB and review score requests for successfully processed items
  // Use English game name from Wikidata (cachedEntry) instead of possibly-translated Steam name
  for (const [appid, { container, gameName }] of containerMap) {
    if (!document.body.contains(container)) continue;

    const cachedEntry = cachedEntriesByAppId.get(appid);
    const englishName = cachedEntry?.gameName || gameName;

    if (userSettings.showHltb && !hltbDataByAppId.has(appid)) {
      queueForHltbResolution(appid, englishName, container);
    }
    if (userSettings.showReviewScores && !reviewScoreDataByAppId.has(appid)) {
      queueForReviewScoreResolution(appid, englishName, container);
    }
  }
}

/**
 * Queues an item for HLTB data resolution.
 * Uses debouncing to collect multiple items before sending a batch request.
 */
function queueForHltbResolution(appid: string, gameName: string, container: HTMLElement): void {
  if (DEBUG) console.log(`${LOG_PREFIX} HLTB: Queueing ${appid} - ${gameName}`); /* istanbul ignore if */
  pendingHltbItems.set(appid, { gameName, container });

  // Reset debounce timer
  if (hltbBatchDebounceTimer) {
    clearTimeout(hltbBatchDebounceTimer);
  }

  hltbBatchDebounceTimer = setTimeout(() => {
    processPendingHltbBatch();
  }, HLTB_BATCH_DEBOUNCE_MS);
}

/**
 * Processes pending HLTB items in smaller batches to prevent service worker timeout.
 * Each batch is limited to HLTB_MAX_BATCH_SIZE games.
 */
async function processPendingHltbBatch(): Promise<void> {
  if (pendingHltbItems.size === 0 || !userSettings.showHltb) {
    return;
  }

  // Collect all pending HLTB items
  const allGames: Array<{ appid: string; gameName: string }> = [];
  const containerMap = new Map<string, { container: HTMLElement; gameName: string }>();

  for (const [appid, { gameName, container }] of pendingHltbItems) {
    allGames.push({ appid, gameName });
    containerMap.set(appid, { container, gameName });
  }

  // Clear pending items before async operation
  pendingHltbItems.clear();
  hltbBatchDebounceTimer = null;

  if (DEBUG) console.log(`${LOG_PREFIX} HLTB: Processing ${allGames.length} games`); /* istanbul ignore if */

  for (let i = 0; i < allGames.length; i += HLTB_MAX_BATCH_SIZE) {
    const games = allGames.slice(i, i + HLTB_MAX_BATCH_SIZE);
    const batchNum = Math.floor(i / HLTB_MAX_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allGames.length / HLTB_MAX_BATCH_SIZE);

    if (DEBUG) console.log(`${LOG_PREFIX} HLTB: Sending batch ${batchNum}/${totalBatches} (${games.length} games)`); /* istanbul ignore if */

    try {
      const response = await sendMessageWithRetry<{ success: boolean; hltbResults?: Record<string, HltbData | null> }>({
        type: 'GET_HLTB_DATA_BATCH',
        games
      });

      if (response?.success && response.hltbResults) {
        // Update HLTB data and re-render icons
        for (const [appid, hltbData] of Object.entries(response.hltbResults)) {
          const itemInfo = containerMap.get(appid);
          if (!itemInfo) continue;

          const { gameName } = itemInfo;

          if (DEBUG) console.log(`${LOG_PREFIX} HLTB result: ${appid} - ${gameName} => mainStory=${hltbData?.mainStory || 0}, hltbId=${hltbData?.hltbId || 0}`); /* istanbul ignore if */

          // Store HLTB data
          hltbDataByAppId.set(appid, hltbData);

          // Find ALL containers for this appid (React virtualization may have re-rendered)
          const allContainersForAppid = document.querySelectorAll<HTMLElement>(`.scpw-platforms[data-appid="${appid}"]`);

          if (allContainersForAppid.length === 0) {
            if (DEBUG) console.log(`${LOG_PREFIX} HLTB: No containers found for ${appid}, data cached for reuse`); /* istanbul ignore if */
            continue;
          }

          // Re-render icons with HLTB data on ALL containers
          const cachedEntry = cachedEntriesByAppId.get(appid);
          if (cachedEntry) {
            for (const targetContainer of allContainersForAppid) {
              updateIconsWithData(targetContainer, cachedEntry, false);  // No loaders - data received
            }

            /* istanbul ignore if */
            if (DEBUG && hltbData && hltbData.mainStory > 0) {
              console.log(`${LOG_PREFIX} HLTB: ${appid} - ${gameName} [${hltbData.mainStory}h main]`);
            }
          }
        }
      /* istanbul ignore else */
      } else if (DEBUG) {
        console.log(`${LOG_PREFIX} HLTB batch ${batchNum} returned no results`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`${LOG_PREFIX} HLTB: Batch ${batchNum} error:`, errorMessage);
      // Continue with next batch even if one fails
    }
  }

  if (DEBUG) console.log(`${LOG_PREFIX} HLTB: All batches complete`); /* istanbul ignore if */
}

/**
 * Queues an item for review score data resolution.
 * Uses debouncing to collect multiple items before sending a batch request.
 */
function queueForReviewScoreResolution(appid: string, gameName: string, container: HTMLElement): void {
  if (DEBUG) console.log(`${LOG_PREFIX} Review scores: Queueing ${appid} - ${gameName}`); /* istanbul ignore if */
  pendingReviewScoreItems.set(appid, { gameName, container });

  // Reset debounce timer
  if (reviewScoreBatchDebounceTimer) {
    clearTimeout(reviewScoreBatchDebounceTimer);
  }

  reviewScoreBatchDebounceTimer = setTimeout(() => {
    processPendingReviewScoreBatch();
  }, REVIEW_SCORE_BATCH_DEBOUNCE_MS);
}

/**
 * Processes pending review score items in smaller batches to prevent service worker timeout.
 */
async function processPendingReviewScoreBatch(): Promise<void> {
  if (pendingReviewScoreItems.size === 0 || !userSettings.showReviewScores) {
    return;
  }

  // Collect all pending review score items
  const allGames: Array<{ appid: string; gameName: string }> = [];
  const containerMap = new Map<string, { container: HTMLElement; gameName: string }>();

  for (const [appid, { gameName, container }] of pendingReviewScoreItems) {
    allGames.push({ appid, gameName });
    containerMap.set(appid, { container, gameName });
  }

  // Clear pending items before async operation
  pendingReviewScoreItems.clear();
  reviewScoreBatchDebounceTimer = null;

  if (DEBUG) console.log(`${LOG_PREFIX} Review scores: Processing ${allGames.length} games`); /* istanbul ignore if */

  for (let i = 0; i < allGames.length; i += REVIEW_SCORE_MAX_BATCH_SIZE) {
    const games = allGames.slice(i, i + REVIEW_SCORE_MAX_BATCH_SIZE);
    const batchNum = Math.floor(i / REVIEW_SCORE_MAX_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allGames.length / REVIEW_SCORE_MAX_BATCH_SIZE);

    if (DEBUG) console.log(`${LOG_PREFIX} Review scores: Sending batch ${batchNum}/${totalBatches} (${games.length} games)`); /* istanbul ignore if */

    try {
      const response = await sendMessageWithRetry<{ success: boolean; reviewScoresResults?: Record<string, ReviewScoreData | null>; _diagnostic?: { total: number; cached: number; toQuery: number; apiCalled: boolean; apiResults: number; error: string | null } }>({
        type: 'GET_REVIEW_SCORES_BATCH',
        games
      });

      // Log diagnostic info from background
      if (DEBUG && response?._diagnostic) {
        console.log(`${LOG_PREFIX} Review scores DIAGNOSTIC from background:`, JSON.stringify(response._diagnostic));
      }

      if (response?.success && response.reviewScoresResults) {
        // Update review score data and re-render icons
        for (const [appid, reviewScoreData] of Object.entries(response.reviewScoresResults)) {
          const itemInfo = containerMap.get(appid);
          if (!itemInfo) continue;

          const { gameName } = itemInfo;

          if (DEBUG) console.log(`${LOG_PREFIX} Review scores result: ${appid} - ${gameName} => score=${reviewScoreData?.score || 0}, tier=${reviewScoreData?.tier || 'Unknown'}`); /* istanbul ignore if */

          // Store review score data
          reviewScoreDataByAppId.set(appid, reviewScoreData);

          // Find ALL containers for this appid (React virtualization may have re-rendered)
          const allContainersForAppid = document.querySelectorAll<HTMLElement>(`.scpw-platforms[data-appid="${appid}"]`);

          if (allContainersForAppid.length === 0) {
            if (DEBUG) console.log(`${LOG_PREFIX} Review scores: No containers found for ${appid}, data cached for reuse`); /* istanbul ignore if */
            continue;
          }

          // Re-render icons with review score data on ALL containers
          const cachedEntry = cachedEntriesByAppId.get(appid);
          if (cachedEntry) {
            for (const targetContainer of allContainersForAppid) {
              updateIconsWithData(targetContainer, cachedEntry, false);  // No loaders - data received
            }
          }
        }
      /* istanbul ignore else */
      } else if (DEBUG) {
        console.log(`${LOG_PREFIX} Review scores batch ${batchNum} returned no results`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`${LOG_PREFIX} Review scores: Batch ${batchNum} error:`, errorMessage);
      // Continue with next batch even if one fails
    }
  }

  if (DEBUG) console.log(`${LOG_PREFIX} Review scores: All batches complete`); /* istanbul ignore if */
}

// ============================================================================
// Item Processing
// ============================================================================

/** Set of appids that have icons already injected (survives React re-renders) */
const injectedAppIds = new Set<string>();

/**
 * BUG-13 FIX: Track appIds currently being processed (in-flight).
 * This prevents the "state desync" logic from incorrectly deleting appIds
 * when a concurrent call sees "tracked but no icons" during the async wait.
 */
const processingAppIds = new Set<string>();

/** Retry configuration for lazy-loaded items */
const INJECTION_MAX_RETRIES = 10;
const INJECTION_BASE_DELAY_MS = 150;

/**
 * Clears stale per-item state when a row is reused for a different appid.
 */
function resetItemForReprocess(item: Element, previousAppId: string | null): void {
  item.removeAttribute(PROCESSED_ATTR);
  item.removeAttribute(ICONS_INJECTED_ATTR);
  const existingIcons = item.querySelector('.scpw-platforms');
  if (existingIcons) existingIcons.remove();

  if (previousAppId) {
    injectedAppIds.delete(previousAppId);
    pendingItems.delete(previousAppId);
  }
}

/**
 * Waits for SVG icons to appear in lazy-loaded items before finding injection point.
 * Steam's virtualized list loads skeletons first, then adds icons slightly later.
 */
async function waitForInjectionPoint(item: Element): Promise<InjectionPoint | null> {
  for (let attempt = 0; attempt <= INJECTION_MAX_RETRIES; attempt++) {
    // Check if item is still in DOM (BUG-5, BUG-12)
    // Item may have been removed by React re-render during our wait
    if (!document.body.contains(item)) {
      if (DEBUG) console.log(`${LOG_PREFIX} Item removed from DOM during wait`); /* istanbul ignore if */
      return null;
    }

    if (item.querySelector('svg[class*="SVGIcon_"]')) {
      return findInjectionPoint(item);
    }
    if (attempt < INJECTION_MAX_RETRIES) {
      await new Promise(r => setTimeout(r, INJECTION_BASE_DELAY_MS * Math.pow(1.5, attempt)));
    }
  }
  return null;
}

/**
 * Processes a single wishlist item element.
 * Extracts appid, injects icons, and requests platform data.
 */
async function processItem(item: Element): Promise<void> {
  const appId = extractAppId(item);
  if (!appId) {
    return;
  }

  // Short-circuit: If all platforms are disabled, don't create any containers
  // This prevents ghost loaders from appearing when user has turned off all icons
  if (!isAnyConsolePlatformEnabled() && !userSettings.showSteamDeck) {
    return;
  }

  // Check if icons actually exist in DOM for this item
  let iconsExistInDom = item.querySelector('.scpw-platforms');

  const processedAppId = item.getAttribute(PROCESSED_ATTR);
  if (processedAppId) {
    if (processedAppId === appId) {
      if (iconsExistInDom) {
        return;
      }
      if (DEBUG) console.log(`${LOG_PREFIX} Icons missing, reprocessing ${appId}`); /* istanbul ignore if */
    /* istanbul ignore else */
    } else if (DEBUG) {
      console.log(`${LOG_PREFIX} Row reused, resetting ${processedAppId} -> ${appId}`);
    }
    resetItemForReprocess(item, processedAppId);
    iconsExistInDom = null;
  }

  // BUG-13 FIX: If this appId is currently being processed by another call, skip
  // This prevents duplicate container creation during the async wait window
  if (processingAppIds.has(appId)) {
    if (DEBUG) console.log(`${LOG_PREFIX} Skipping ${appId} - already being processed`); /* istanbul ignore if */
    return;
  }

  // If injectedAppIds thinks icons exist, verify they're actually in DOM
  // React virtualization can destroy DOM elements, desync'ing our tracking state
  if (injectedAppIds.has(appId)) {
    if (iconsExistInDom) {
      // Icons actually exist - skip processing
      if (DEBUG) console.log(`${LOG_PREFIX} Skipping ${appId} - icons verified in DOM`); /* istanbul ignore if */
      item.setAttribute(PROCESSED_ATTR, appId);
      return;
    } else {
      // State desync: injectedAppIds says injected, but icons are gone (React destroyed them)
      // Only re-inject if not currently being processed by another call
      if (DEBUG) console.log(`${LOG_PREFIX} Re-injecting ${appId} - React destroyed icons`); /* istanbul ignore if */
      injectedAppIds.delete(appId);
    }
  } else if (iconsExistInDom) {
    // Icons exist but not tracked - sync our state
    if (DEBUG) console.log(`${LOG_PREFIX} Skipping ${appId} - icons already in DOM (syncing)`); /* istanbul ignore if */
    injectedAppIds.add(appId);
    item.setAttribute(PROCESSED_ATTR, appId);
    return;
  }

  // Mark as processed immediately to prevent duplicate processing
  item.setAttribute(PROCESSED_ATTR, appId);

  // Log new appids (deduplicated) - only on first discovery
  const isNewAppId = !processedAppIds.has(appId);
  if (isNewAppId) {
    processedAppIds.add(appId);
    console.log(`${LOG_PREFIX} Found appid: ${appId}`);
  }

  const gameName = extractGameName(item);

  // BUG-13 FIX: Mark as "in-flight" to prevent concurrent calls from creating duplicates
  // This must happen BEFORE any async work
  processingAppIds.add(appId);
  injectedAppIds.add(appId);

  // Wait for injection point to be ready (handles lazy-loaded items where
  // Steam loads SVG icons slightly after the item skeleton appears)
  let injectionPoint = await waitForInjectionPoint(item);
  if (!injectionPoint) {
    // Fallback: Use whatever injection point we can find
    if (DEBUG) console.log(`${LOG_PREFIX} Using fallback injection for appid ${appId}`); /* istanbul ignore if */
    injectionPoint = findInjectionPoint(item);
  }
  const { container, insertAfter } = injectionPoint;

  // Create and inject icons container (initially in loading state)
  const iconsContainer = createIconsContainer(appId, gameName);

  // Insert at the appropriate position
  if (insertAfter) {
    insertAfter.after(iconsContainer);
  } else {
    container.appendChild(iconsContainer);
  }
  item.setAttribute(ICONS_INJECTED_ATTR, 'true');
  // BUG-13 FIX: Done processing - remove from in-flight set
  processingAppIds.delete(appId);

  // Check if we already have cached data for this game
  // First check in-memory cache (fast), then persistent storage
  let cachedEntry = cachedEntriesByAppId.get(appId);

  // Restore HLTB and review score data from in-memory cache if needed
  // (maps may have been cleared on URL change while cachedEntriesByAppId wasn't)
  if (cachedEntry) {
    restoreHltbDataFromEntry(appId, cachedEntry);
    restoreReviewScoreDataFromEntry(appId, cachedEntry);
  }

  // If not in memory, check chrome.storage.local before showing loader
  if (!cachedEntry) {
    const storageKey = `xcpw_cache_${appId}`;
    const storageResult = await chrome.storage.local.get(storageKey);
    const persistentEntry = storageResult[storageKey] as CacheEntry | undefined;

    if (persistentEntry?.resolvedAt && persistentEntry?.ttlDays) {
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const expiresAt = persistentEntry.resolvedAt + persistentEntry.ttlDays * MS_PER_DAY;
      const isValid = Date.now() < expiresAt && persistentEntry.cacheVersion === CACHE_VERSION;

      if (isValid) {
        cachedEntry = persistentEntry;
        cachedEntriesByAppId.set(appId, persistentEntry);
        restoreHltbDataFromEntry(appId, persistentEntry);
        restoreReviewScoreDataFromEntry(appId, persistentEntry);
      }
    }
  }

  if (cachedEntry) {
    if (DEBUG) console.log(`${LOG_PREFIX} Using cached data for appid ${appId}`); /* istanbul ignore if */
    updateIconsWithData(iconsContainer, cachedEntry, false);  // No loaders for cache hit
    const iconSummary = getRenderedIconSummary(iconsContainer);
    console.log(`${LOG_PREFIX} Rendered (cache-reuse): ${appId} - ${gameName} [icons: ${iconSummary}]`);

    // Queue HLTB and review score requests even for cache-reuse (fetched separately)
    const englishName = cachedEntry.gameName || gameName;
    if (userSettings.showHltb && !hltbDataByAppId.has(appId)) {
      queueForHltbResolution(appId, englishName, iconsContainer);
    }
    if (DEBUG) console.log(`${LOG_PREFIX} Review check for ${appId}: showReviewScores=${userSettings.showReviewScores}, inMap=${reviewScoreDataByAppId.has(appId)}, cachedHas=${!!cachedEntry.reviewScoreData}`); /* istanbul ignore if */
    if (userSettings.showReviewScores && !reviewScoreDataByAppId.has(appId)) {
      queueForReviewScoreResolution(appId, englishName, iconsContainer);
    }
    return;
  }

  // No cached data - need network call (cold start), so add loader now
  const loader = document.createElement('span');
  loader.className = 'scpw-loader';
  loader.setAttribute('aria-hidden', 'true');
  iconsContainer.appendChild(loader);

  // Queue for batch resolution instead of individual request
  if (DEBUG) console.log(`${LOG_PREFIX} Queuing appid ${appId} for batch resolution`); /* istanbul ignore if */
  queueForBatchResolution(appId, gameName, iconsContainer);
}

/**
 * Finds and processes all wishlist items in a given root element.
 * Uses multiple detection strategies to support both unfiltered and filtered views.
 */
function processWishlistItems(root: Element | Document = document): void {
  const items = findWishlistItems(root);
  items.forEach(item => processItem(item));
}

// ============================================================================
// MutationObserver
// ============================================================================

/**
 * Sets up a MutationObserver for infinite scroll / virtualized list loading.
 * Uses debouncing to batch rapid DOM updates (e.g., during scroll virtualization).
 */
function setupObserver(): void {
  const observer = new MutationObserver((mutations) => {
    // Process when new nodes are added or rows are reused via attribute updates
    const hasRelevantChanges = mutations.some(m => {
      if (m.type === 'childList') {
        return m.addedNodes.length > 0;
      }
      if (m.type === 'attributes') {
        return m.attributeName === 'data-rfd-draggable-id' || m.attributeName === 'href';
      }
      return false;
    });
    if (!hasRelevantChanges) return;

    // Debounce to batch rapid updates during scroll/filter changes
    if (observerDebounceTimer) clearTimeout(observerDebounceTimer);

    observerDebounceTimer = setTimeout(() => {
      processWishlistItems();
    }, 50);
  });

  // Observe the entire body since the wishlist uses virtualization
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-rfd-draggable-id', 'href'],
  });

  console.log(`${LOG_PREFIX} MutationObserver attached`);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Main initialization function.
 */
async function init(): Promise<void> {
  console.log(`${LOG_PREFIX} Initializing...`);

  if (!PLATFORM_ICONS || !PLATFORM_INFO || !STATUS_INFO) {
    console.error(`${LOG_PREFIX} Missing icon definitions (icons.js not loaded?)`);
    return;
  }

  // Load user settings first and set up change listener
  await loadUserSettings();
  setupSettingsChangeListener();

  // Load Steam Deck data from page script (runs in MAIN world)
  const SteamDeck = globalThis.SCPW_SteamDeck;
  if (SteamDeck && userSettings.showSteamDeck) {
    const latestDeckData = await SteamDeck.waitForDeckData();
    if (latestDeckData.size > 0) {
      steamDeckData = latestDeckData;
    }
  }

  // Process existing items
  processWishlistItems();

  // Schedule a follow-up Steam Deck refresh in case SSR updates lag behind
  steamDeckRefreshAttempts = 0;
  scheduleSteamDeckRefresh('init');

  // Set up observer for dynamic content
  setupObserver();

  // Monitor URL changes for filter changes (Steam uses client-side routing)
  // When filters change, we need to re-process items since the DOM structure changes
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (DEBUG) console.log(`${LOG_PREFIX} URL changed, scheduling cleanup and re-processing`); /* istanbul ignore if */

      // Light cleanup - preserve icons in DOM to prevent blink
      // Icons will be reused by processItem if the same games are still visible
      lightCleanup();

      // Clear any existing debounce timer
      if (urlChangeDebounceTimer) {
        clearTimeout(urlChangeDebounceTimer);
      }

      // Debounce the processing to let React finish re-rendering
      urlChangeDebounceTimer = setTimeout(async () => {
        urlChangeDebounceTimer = null;
        if (DEBUG) console.log(`${LOG_PREFIX} Processing after URL change debounce`); /* istanbul ignore if */

        // Refresh Steam Deck data (SSR may have updated with new filter results)
        if (userSettings.showSteamDeck) {
          const SteamDeck = globalThis.SCPW_SteamDeck;
          if (SteamDeck) {
            const latestDeckData = await SteamDeck.waitForDeckData();
            if (latestDeckData.size > 0) {
              steamDeckData = latestDeckData;
            }
          }
        }

        processWishlistItems();

        steamDeckRefreshAttempts = 0;
        scheduleSteamDeckRefresh('url-change');
      }, URL_CHANGE_DEBOUNCE_MS);
    }
  }, 500);

  console.log(`${LOG_PREFIX} Initialization complete. Started processing items.`);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export internal functions for testing (not used in production)
if (typeof globalThis !== 'undefined') {
  globalThis.SCPW_ContentTestExports = {
    queueForBatchResolution,
    processPendingBatch,
    pendingItems,
    updateIconsWithData,
    createIconsContainer,
    createPlatformIcon,
    extractAppId,
    extractGameName,
    parseSvg,
    removeLoadingState,
    findInjectionPoint,
    requestPlatformData,
    sendMessageWithRetry,
    MESSAGE_MAX_RETRIES,
    MESSAGE_RETRY_DELAY_MS,
    // New exports for BUG-3 fixes
    findWishlistRow,
    findWishlistItems,
    checkDeckFilterActive,
    // Icon lifecycle management exports (BUG-1, BUG-2, BUG-5, BUG-6, BUG-12)
    clearPendingTimersAndBatches,
    cleanupAllIcons,
    lightCleanup,
    injectedAppIds,
    processedAppIds,
    processingAppIds,
    // Timer exports for testing (getters since they're reassigned primitives)
    getBatchDebounceTimer: () => batchDebounceTimer,
    getUrlChangeDebounceTimer: () => urlChangeDebounceTimer,
    setBatchDebounceTimer: (val: ReturnType<typeof setTimeout> | null) => { batchDebounceTimer = val; },
    URL_CHANGE_DEBOUNCE_MS,
    // Additional exports for coverage testing
    processItem,
    waitForInjectionPoint,
    loadUserSettings,
    setSteamDeckData: (val: Map<string, DeckCategory> | null) => { steamDeckData = val; },
    getSteamDeckData: () => steamDeckData,
    // Steam Deck refresh exports for coverage testing
    isSameDeckData,
    refreshIconsFromCache,
    refreshSteamDeckData,
    scheduleSteamDeckRefresh,
    markMissingSteamDeckData,
    getEnabledPlatforms,
    isAnyConsolePlatformEnabled,
    setupSettingsChangeListener,
    getMissingSteamDeckAppIds: () => missingSteamDeckAppIds,
    getSteamDeckRefreshAttempts: () => steamDeckRefreshAttempts,
    setSteamDeckRefreshAttempts: (val: number) => { steamDeckRefreshAttempts = val; },
    getCachedEntriesByAppId: () => cachedEntriesByAppId,
    getUserSettings: () => userSettings,
    setUserSettings: (val: Partial<typeof userSettings>) => { userSettings = { ...userSettings, ...val }; },
    getSteamDeckRefreshTimer: () => steamDeckRefreshTimer,
    setSteamDeckRefreshTimer: (val: ReturnType<typeof setTimeout> | null) => { steamDeckRefreshTimer = val; },
    STEAM_DECK_REFRESH_DELAYS_MS,
    // HLTB exports for coverage testing
    formatHltbTime,
    createHltbBadge,
    createHltbLoader,
    queueForHltbResolution,
    processPendingHltbBatch,
    getHltbDataByAppId: () => hltbDataByAppId,
    getPendingHltbItems: () => pendingHltbItems,
    getHltbBatchDebounceTimer: () => hltbBatchDebounceTimer,
    setHltbBatchDebounceTimer: (val: ReturnType<typeof setTimeout> | null) => { hltbBatchDebounceTimer = val; },
    HLTB_BATCH_DEBOUNCE_MS,
    HLTB_MAX_BATCH_SIZE,
    restoreHltbDataFromEntry,
    getRenderedIconSummary,
    // Review score exports for coverage testing
    getTierColor,
    getDisplayScoreInfo,
    createReviewScoreBadge,
    createReviewScoreLoader,
    queueForReviewScoreResolution,
    processPendingReviewScoreBatch,
    getReviewScoreDataByAppId: () => reviewScoreDataByAppId,
    getPendingReviewScoreItems: () => pendingReviewScoreItems,
    getReviewScoreBatchDebounceTimer: () => reviewScoreBatchDebounceTimer,
    setReviewScoreBatchDebounceTimer: (val: ReturnType<typeof setTimeout> | null) => { reviewScoreBatchDebounceTimer = val; },
    REVIEW_SCORE_BATCH_DEBOUNCE_MS,
    REVIEW_SCORE_MAX_BATCH_SIZE,
    restoreReviewScoreDataFromEntry,
    // Steam Deck refresh helpers
    getSteamDeckRefreshInFlight: () => steamDeckRefreshInFlight,
    setSteamDeckRefreshInFlight: (val: boolean) => { steamDeckRefreshInFlight = val; }
  };
}
