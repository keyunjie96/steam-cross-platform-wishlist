/**
 * Steam Cross-Platform Wishlist - Content Script
 *
 * Injects platform availability icons into Steam wishlist rows.
 * - Extracts Steam appids from wishlist items
 * - Communicates with background service worker for platform data (via IGDB)
 * - Renders NS/PS/XB icons with appropriate states
 * - Handles infinite scroll with MutationObserver
 */

import type { Platform, PlatformStatus, CacheEntry, DeckCategory, GetPlatformDataResponse, ReviewScoreCacheEntry, ReviewScore } from './types';

const PROCESSED_ATTR = 'data-xcpw-processed';
const ICONS_INJECTED_ATTR = 'data-xcpw-icons';
const LOG_PREFIX = '[Steam Cross-Platform Wishlist]';
const DEBUG = false; // Set to true for verbose debugging

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
 * Removes all injected icon elements and clears tracking state.
 * Called on URL changes (filter/sort) to prevent orphaned icons.
 * This is critical because Steam's React-based UI can detach our containers
 * while keeping them in shared parent elements.
 */
function cleanupAllIcons(): void {
  // Clear any pending batch timer (prevent stale batch from firing)
  if (batchDebounceTimer) {
    clearTimeout(batchDebounceTimer);
    batchDebounceTimer = null;
  }

  if (steamDeckRefreshTimer) {
    clearTimeout(steamDeckRefreshTimer);
    steamDeckRefreshTimer = null;
  }
  steamDeckRefreshAttempts = 0;

  // Remove all icon containers from DOM
  document.querySelectorAll('.xcpw-platforms').forEach(el => el.remove());

  // Clear tracking state
  injectedAppIds.clear();
  processedAppIds.clear();
  missingSteamDeckAppIds.clear();
  cachedReviewScoresByAppId.clear();

  // Clear pending batch (stale container references)
  pendingItems.clear();

  // Clear processed attributes
  document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => {
    el.removeAttribute(PROCESSED_ATTR);
  });
  document.querySelectorAll(`[${ICONS_INJECTED_ATTR}]`).forEach(el => {
    el.removeAttribute(ICONS_INJECTED_ATTR);
  });

  if (DEBUG) console.log(`${LOG_PREFIX} Cleanup complete - all icons and tracking state cleared`);
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

/** User settings (loaded from storage) */
let userSettings = {
  showNintendo: true,
  showPlaystation: true,
  showXbox: true,
  showSteamDeck: true,
  showReviewScores: true
};

/** Pre-extracted Steam Deck data from page SSR (Map of appId -> category) */
let steamDeckData: Map<string, DeckCategory> | null = null;

/** Cached platform data entries for refreshes */
const cachedEntriesByAppId = new Map<string, CacheEntry>();

/** Cached review score entries */
const cachedReviewScoresByAppId = new Map<string, ReviewScoreCacheEntry>();

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
    const result = await chrome.storage.sync.get('xcpwSettings');
    if (result.xcpwSettings) {
      userSettings = { ...userSettings, ...result.xcpwSettings };
    }
    if (DEBUG) console.log(`${LOG_PREFIX} Loaded settings:`, userSettings);
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
    if (areaName !== 'sync' || !changes.xcpwSettings) {
      return;
    }

    const oldSettings = changes.xcpwSettings.oldValue || {};
    const newSettings = changes.xcpwSettings.newValue || {};

    // Update local settings
    userSettings = { ...userSettings, ...newSettings };
    if (DEBUG) console.log(`${LOG_PREFIX} Settings changed:`, { old: oldSettings, new: newSettings });

    // Check if any platform was just enabled
    const platformsJustEnabled: Platform[] = [];

    if (newSettings.showNintendo && !oldSettings.showNintendo) platformsJustEnabled.push('nintendo');
    if (newSettings.showPlaystation && !oldSettings.showPlaystation) platformsJustEnabled.push('playstation');
    if (newSettings.showXbox && !oldSettings.showXbox) platformsJustEnabled.push('xbox');
    if (newSettings.showSteamDeck && !oldSettings.showSteamDeck) platformsJustEnabled.push('steamdeck');

    // Check if review scores setting changed
    const reviewScoresJustEnabled = newSettings.showReviewScores && !oldSettings.showReviewScores;
    const reviewScoresJustDisabled = !newSettings.showReviewScores && oldSettings.showReviewScores;

    // Check if any platform was just disabled
    const platformsJustDisabled: Platform[] = [];

    if (!newSettings.showNintendo && oldSettings.showNintendo) platformsJustDisabled.push('nintendo');
    if (!newSettings.showPlaystation && oldSettings.showPlaystation) platformsJustDisabled.push('playstation');
    if (!newSettings.showXbox && oldSettings.showXbox) platformsJustDisabled.push('xbox');
    if (!newSettings.showSteamDeck && oldSettings.showSteamDeck) platformsJustDisabled.push('steamdeck');

    if (platformsJustEnabled.length > 0 || platformsJustDisabled.length > 0 || reviewScoresJustEnabled || reviewScoresJustDisabled) {
      console.log(`${LOG_PREFIX} Settings changed - platforms enabled: [${platformsJustEnabled.join(', ')}], disabled: [${platformsJustDisabled.join(', ')}], reviewScores: ${reviewScoresJustEnabled ? 'enabled' : reviewScoresJustDisabled ? 'disabled' : 'unchanged'}`);

      // Refresh icons from cache for all visible containers
      // This will show/hide icons based on new settings without re-fetching data
      refreshIconsFromCache('settings-change');

      // Also update ALL containers with loaders (not just pending ones)
      // This handles lazy-loaded games that may have stale references or were just created
      // Use querySelectorAll with filter for browser compatibility (avoids :has() selector)
      const allContainers = document.querySelectorAll<HTMLElement>('.xcpw-platforms');
      for (const container of allContainers) {
        // Skip containers without loaders
        if (!container.querySelector('.xcpw-loader')) continue;
        const appid = container.getAttribute('data-appid');
        if (!appid) continue;

        // If we have cached data, use it to update the container
        const cachedEntry = cachedEntriesByAppId.get(appid);
        if (cachedEntry) {
          updateIconsWithData(container, cachedEntry);
          if (DEBUG) console.log(`${LOG_PREFIX} Updated loading container from cache: ${appid}`);
        } else if (!isAnyConsolePlatformEnabled() && !newSettings.showSteamDeck) {
          // No cached data and all platforms disabled - just remove loader
          removeLoadingState(container);
          if (DEBUG) console.log(`${LOG_PREFIX} Removed loader (all platforms disabled): ${appid}`);
        }
        // Otherwise, loader stays while waiting for batch resolution (normal case)
      }

      // Also update pending items map with fresh container references
      for (const [appid, pendingInfo] of pendingItems) {
        if (!document.body.contains(pendingInfo.container)) {
          // Container is stale - try to find fresh one
          const freshContainer = document.querySelector<HTMLElement>(`.xcpw-platforms[data-appid="${appid}"]`);
          if (freshContainer) {
            pendingInfo.container = freshContainer;
          }
        }
      }

      // If Steam Deck was just enabled, fetch Steam Deck data
      if (platformsJustEnabled.includes('steamdeck') && !steamDeckData) {
        const SteamDeck = globalThis.XCPW_SteamDeck;
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
    const container = document.querySelector<HTMLElement>(`.xcpw-platforms[data-appid="${appid}"]`);
    if (!container || !document.body.contains(container)) continue;

    updateIconsWithData(container, data);
    refreshedCount++;

    const gameName = data.gameName || container.getAttribute('data-game-name') || 'Unknown Game';
    const iconSummary = getRenderedIconSummary(container);
    console.log(`${LOG_PREFIX} Rendered (deck-refresh): ${appid} - ${gameName} [icons: ${iconSummary}]`);
  }

  if (DEBUG) console.log(`${LOG_PREFIX} Steam Deck refresh (${reason}) updated ${refreshedCount} items`);
}

/**
 * Refreshes Steam Deck data and re-renders icons if new data arrives.
 */
async function refreshSteamDeckData(reason: string): Promise<void> {
  if (steamDeckRefreshInFlight) return;
  const SteamDeck = globalThis.XCPW_SteamDeck;
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
  if (!userSettings.showSteamDeck || !globalThis.XCPW_SteamDeck) return;
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
  if (!appid || !userSettings.showSteamDeck || !globalThis.XCPW_SteamDeck) return;

  const wasEmpty = missingSteamDeckAppIds.size === 0;
  missingSteamDeckAppIds.add(appid);

  if (wasEmpty && steamDeckRefreshAttempts >= STEAM_DECK_REFRESH_DELAYS_MS.length) {
    steamDeckRefreshAttempts = 0;
  }

  scheduleSteamDeckRefresh('missing-deck');
}

// Definitions loaded from types.js and icons.js
// Note: StoreUrls is declared in types.js, access via globalThis to avoid redeclaration
const PLATFORM_ICONS = globalThis.XCPW_Icons;
const PLATFORM_INFO = globalThis.XCPW_PlatformInfo;
const STATUS_INFO = globalThis.XCPW_StatusInfo;
const STEAM_DECK_TIERS = globalThis.XCPW_SteamDeckTiers;

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
      const hasIcons = !!item.querySelector('.xcpw-platforms');
      if (processedAppId === appid && hasIcons) return;
      items.set(appid, item);
    });

  // Strategy 2: Filtered view - find app links and walk up to row
  root.querySelectorAll('a[href*="/app/"]').forEach(link => {
    // Skip links inside our own icons
    if (link.closest('.xcpw-platforms')) return;

    const row = findWishlistRow(link);
    if (!row) return;
    const appid = extractAppId(row);
    if (!appid) return;
    const processedAppId = row.getAttribute(PROCESSED_ATTR);
    const hasIcons = !!row.querySelector('.xcpw-platforms');
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
  // Primary: Get title from app link (most reliable)
  const titleLink = item.querySelector('a[href*="/app/"]');
  if (titleLink) {
    const linkText = titleLink.textContent?.trim();
    if (linkText && linkText.length > 0 && linkText.length < 200) {
      return linkText;
    }

    // Fallback: Extract from URL slug
    const href = titleLink.getAttribute('href');
    const match = href?.match(/\/app\/\d+\/([^/?]+)/);
    if (match) {
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
 * Creates the platform icons container with a subtle loading indicator.
 * Icons are added dynamically in updateIconsWithData() once data is resolved.
 * This prevents visual noise from showing 4 pulsing icons that then disappear.
 */
function createIconsContainer(appid: string, gameName: string): HTMLElement {
  const container = document.createElement('span');
  container.className = 'xcpw-platforms';
  container.setAttribute('data-appid', appid);
  container.setAttribute('data-game-name', gameName);

  // Single subtle loader instead of 4 platform icons
  const loader = document.createElement('span');
  loader.className = 'xcpw-loader';
  loader.setAttribute('aria-hidden', 'true');
  container.appendChild(loader);

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
  const url = storeUrl || globalThis.XCPW_StoreUrls[platform](gameName);
  // Steam Deck icons are not clickable (just informational)
  // Console platforms: clickable when available or unknown (to search)
  const isClickable = platform !== 'steamdeck' && status !== 'unavailable';
  const icon = document.createElement(isClickable ? 'a' : 'span');

  icon.className = `xcpw-platform-icon xcpw-${status}`;
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
 * Gets the color class for a review score.
 * Scores 75+ are "good" (green), 50-74 are "mixed" (yellow), below 50 are "poor" (red).
 */
function getScoreColorClass(score: number): string {
  if (score >= 75) return 'xcpw-score-good';
  if (score >= 50) return 'xcpw-score-mixed';
  return 'xcpw-score-poor';
}

/**
 * Creates a review score badge element.
 */
function createReviewScoreBadge(reviewScore: ReviewScore): HTMLElement {
  const badge = document.createElement('a');
  badge.className = `xcpw-review-badge ${getScoreColorClass(reviewScore.score)}`;
  badge.textContent = reviewScore.score.toString();

  // Build tooltip
  let tooltip = `OpenCritic: ${reviewScore.score}/100`;
  if (reviewScore.tier) {
    tooltip += ` (${reviewScore.tier})`;
  }
  if (reviewScore.criticCount) {
    tooltip += ` - ${reviewScore.criticCount} critic reviews`;
  }
  badge.setAttribute('title', tooltip);

  if (reviewScore.url) {
    badge.setAttribute('href', reviewScore.url);
    badge.setAttribute('target', '_blank');
    badge.setAttribute('rel', 'noopener noreferrer');
  }

  return badge;
}

/**
 * Updates the icons container with platform data from cache.
 * Dynamically adds icons for available platforms (none exist initially).
 * Steam Deck icons are fetched separately from Steam's store pages.
 * Only shows icons for platforms where the game is available:
 * - available: Full opacity, clickable - opens store page
 * - unavailable/unknown: Hidden (not displayed)
 */
function updateIconsWithData(container: HTMLElement, data: CacheEntry): void {
  const gameName = data.gameName || container.getAttribute('data-game-name') || '';
  const appid = container.getAttribute('data-appid');
  const enabledPlatforms = getEnabledPlatforms();
  const iconsToAdd: HTMLElement[] = [];

  // Reset previous icons to keep updates idempotent
  container.querySelectorAll('.xcpw-platform-icon, .xcpw-separator').forEach(el => el.remove());

  // Get Steam Deck client if available
  const SteamDeck = globalThis.XCPW_SteamDeck;

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
  const loader = container.querySelector('.xcpw-loader');
  if (loader) loader.remove();

  // Remove existing review badge to keep updates idempotent
  container.querySelectorAll('.xcpw-review-badge').forEach(el => el.remove());

  // Only add separator and icons if we have visible icons
  if (iconsToAdd.length > 0) {
    const separator = document.createElement('span');
    separator.className = 'xcpw-separator';
    container.appendChild(separator);

    for (const icon of iconsToAdd) {
      container.appendChild(icon);
    }
  }

  // Add review score badge if enabled and data is available
  if (userSettings.showReviewScores && appid) {
    const reviewData = cachedReviewScoresByAppId.get(appid);
    if (reviewData?.score) {
      // Add separator before badge if we already have icons, otherwise add one
      if (iconsToAdd.length === 0) {
        const separator = document.createElement('span');
        separator.className = 'xcpw-separator';
        container.appendChild(separator);
      }
      const badge = createReviewScoreBadge(reviewData.score);
      container.appendChild(badge);
    }
  }
}

/**
 * Creates a concise log string describing rendered icons for a container.
 */
function getRenderedIconSummary(container: HTMLElement): string {
  const summaries: string[] = [];

  const icons = Array.from(container.querySelectorAll('.xcpw-platform-icon'));
  for (const icon of icons) {
    const platform = icon.getAttribute('data-platform') || 'unknown';
    const tier = icon.getAttribute('data-tier');
    if (tier) {
      summaries.push(`${platform}:${tier}`);
    } else {
      const status = icon.classList.contains('xcpw-available')
        ? 'available'
        : icon.classList.contains('xcpw-unavailable')
          ? 'unavailable'
          : 'unknown';
      summaries.push(`${platform}:${status}`);
    }
  }

  // Check for review score badge
  const reviewBadge = container.querySelector('.xcpw-review-badge');
  if (reviewBadge) {
    summaries.push(`score:${reviewBadge.textContent}`);
  }

  return summaries.length > 0 ? summaries.join(', ') : 'none';
}

/**
 * Removes loading state from container when data fetch fails.
 * Since we now use a single loader, this just removes the loader element.
 * The container will be empty (no icons shown) on failure.
 */
function removeLoadingState(container: HTMLElement): void {
  const loader = container.querySelector('.xcpw-loader');
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
  const svgIcons = item.querySelectorAll('svg:not(.xcpw-platforms svg)');
  const groupCounts = new Map<Element, { count: number; lastWrapper: Element }>();
  for (const svg of svgIcons) {
    if (svg.closest('.xcpw-platforms')) continue;
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
        if (DEBUG) console.log(`${LOG_PREFIX} Message retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
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

  // Skip Wikidata fetch if all console platforms are disabled
  // But still fetch review scores if enabled
  if (!isAnyConsolePlatformEnabled()) {
    if (DEBUG) console.log(`${LOG_PREFIX} Skipping platform batch - all console platforms disabled`);

    // Fetch review scores if enabled
    if (userSettings.showReviewScores) {
      try {
        const reviewResponse = await sendMessageWithRetry<{ success: boolean; results: Record<string, { data: ReviewScoreCacheEntry; fromCache: boolean }> }>({
          type: 'GET_REVIEW_SCORE_BATCH',
          games
        });
        if (reviewResponse?.success && reviewResponse.results) {
          for (const [appid, result] of Object.entries(reviewResponse.results) as Array<[string, { data: ReviewScoreCacheEntry; fromCache: boolean }]>) {
            if (result.data) {
              cachedReviewScoresByAppId.set(appid, result.data);
            }
          }
        }
      } catch {
        // Silently fail review score fetch
      }
    }

    for (const [appid, { container }] of containerMap) {
      // Create a minimal cache entry with no console platform data
      const minimalEntry: CacheEntry = {
        appid,
        gameName: containerMap.get(appid)!.gameName,
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

      // Always call updateIconsWithData - it handles removing the loader
      // and will show Steam Deck icons if enabled and data is available
      updateIconsWithData(container, minimalEntry);
    }
    return;
  }

  if (DEBUG) console.log(`${LOG_PREFIX} Sending batch request for ${games.length} games`);

  try {
    // Fetch platform data and review scores in parallel
    const platformPromise = sendMessageWithRetry<{ success: boolean; results: Record<string, { data: CacheEntry; fromCache: boolean }> }>({
      type: 'GET_PLATFORM_DATA_BATCH',
      games
    });

    // Only fetch review scores if enabled
    const reviewPromise = userSettings.showReviewScores
      ? sendMessageWithRetry<{ success: boolean; results: Record<string, { data: ReviewScoreCacheEntry; fromCache: boolean }> }>({
          type: 'GET_REVIEW_SCORE_BATCH',
          games
        })
      : Promise.resolve(null);

    const [response, reviewResponse] = await Promise.all([platformPromise, reviewPromise]);

    // Cache review scores
    if (reviewResponse?.success && reviewResponse.results) {
      for (const [appid, result] of Object.entries(reviewResponse.results) as Array<[string, { data: ReviewScoreCacheEntry; fromCache: boolean }]>) {
        if (result.data) {
          cachedReviewScoresByAppId.set(appid, result.data);
        }
      }
    }

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
        }

        // BUG-13 FIX: Update ALL containers for this appid, not just the one in containerMap
        // React's virtualization can create multiple containers when items are re-rendered
        // while a batch request is in flight, causing duplicate containers with ghost loaders
        const allContainersForAppid = document.querySelectorAll<HTMLElement>(`.xcpw-platforms[data-appid="${appid}"]`);

        if (allContainersForAppid.length === 0) {
          if (DEBUG) console.log(`${LOG_PREFIX} No containers found for ${appid}, data cached for reuse`);
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
  const existingIcons = item.querySelector('.xcpw-platforms');
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
      if (DEBUG) console.log(`${LOG_PREFIX} Item removed from DOM during wait`);
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
  let iconsExistInDom = item.querySelector('.xcpw-platforms');

  const processedAppId = item.getAttribute(PROCESSED_ATTR);
  if (processedAppId) {
    if (processedAppId === appId) {
      if (iconsExistInDom) {
        return;
      }
      if (DEBUG) console.log(`${LOG_PREFIX} Icons missing, reprocessing ${appId}`);
    } else if (DEBUG) {
      console.log(`${LOG_PREFIX} Row reused, resetting ${processedAppId} -> ${appId}`);
    }
    resetItemForReprocess(item, processedAppId);
    iconsExistInDom = null;
  }

  // BUG-13 FIX: If this appId is currently being processed by another call, skip
  // This prevents duplicate container creation during the async wait window
  if (processingAppIds.has(appId)) {
    if (DEBUG) console.log(`${LOG_PREFIX} Skipping ${appId} - already being processed`);
    return;
  }

  // If injectedAppIds thinks icons exist, verify they're actually in DOM
  // React virtualization can destroy DOM elements, desync'ing our tracking state
  if (injectedAppIds.has(appId)) {
    if (iconsExistInDom) {
      // Icons actually exist - skip processing
      if (DEBUG) console.log(`${LOG_PREFIX} Skipping ${appId} - icons verified in DOM`);
      item.setAttribute(PROCESSED_ATTR, appId);
      return;
    } else {
      // State desync: injectedAppIds says injected, but icons are gone (React destroyed them)
      // Only re-inject if not currently being processed by another call
      if (DEBUG) console.log(`${LOG_PREFIX} Re-injecting ${appId} - React destroyed icons`);
      injectedAppIds.delete(appId);
    }
  } else if (iconsExistInDom) {
    // Icons exist but not tracked - sync our state
    if (DEBUG) console.log(`${LOG_PREFIX} Skipping ${appId} - icons already in DOM (syncing)`);
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
    if (DEBUG) console.log(`${LOG_PREFIX} Using fallback injection for appid ${appId}`);
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
  // This happens when React re-renders and destroys/recreates DOM elements
  const cachedEntry = cachedEntriesByAppId.get(appId);
  if (cachedEntry) {
    if (DEBUG) console.log(`${LOG_PREFIX} Using cached data for appid ${appId}`);
    updateIconsWithData(iconsContainer, cachedEntry);
    const iconSummary = getRenderedIconSummary(iconsContainer);
    console.log(`${LOG_PREFIX} Rendered (cache-reuse): ${appId} - ${gameName} [icons: ${iconSummary}]`);
    return;
  }

  // Queue for batch resolution instead of individual request
  // This dramatically reduces Wikidata API calls by batching multiple games together
  if (DEBUG) console.log(`${LOG_PREFIX} Queuing appid ${appId} for batch resolution`);
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
  const SteamDeck = globalThis.XCPW_SteamDeck;
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
      if (DEBUG) console.log(`${LOG_PREFIX} URL changed, scheduling cleanup and re-processing`);

      // Full cleanup immediately (remove old icons)
      // Prevents orphaned icons and stale references (BUG-1, BUG-2, BUG-5, BUG-6)
      cleanupAllIcons();

      // Clear any existing debounce timer
      if (urlChangeDebounceTimer) {
        clearTimeout(urlChangeDebounceTimer);
      }

      // Debounce the processing to let React finish re-rendering
      urlChangeDebounceTimer = setTimeout(async () => {
        urlChangeDebounceTimer = null;
        if (DEBUG) console.log(`${LOG_PREFIX} Processing after URL change debounce`);

        // Refresh Steam Deck data (SSR may have updated with new filter results)
        if (userSettings.showSteamDeck) {
          const SteamDeck = globalThis.XCPW_SteamDeck;
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
  globalThis.XCPW_ContentTestExports = {
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
    cleanupAllIcons,
    injectedAppIds,
    processedAppIds,
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
    setUserSettings: (val: { showNintendo: boolean; showPlaystation: boolean; showXbox: boolean; showSteamDeck: boolean; showReviewScores?: boolean }) => { userSettings = { ...userSettings, ...val }; },
    getSteamDeckRefreshTimer: () => steamDeckRefreshTimer,
    setSteamDeckRefreshTimer: (val: ReturnType<typeof setTimeout> | null) => { steamDeckRefreshTimer = val; },
    STEAM_DECK_REFRESH_DELAYS_MS,
    // Review scores exports
    createReviewScoreBadge,
    getScoreColorClass,
    getCachedReviewScoresByAppId: () => cachedReviewScoresByAppId
  };
}
