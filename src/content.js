/**
 * Steam Cross-Platform Wishlist - Content Script
 *
 * Injects platform availability icons into Steam wishlist rows.
 * - Extracts Steam appids from wishlist items
 * - Communicates with background service worker for platform data (via IGDB)
 * - Renders NS/PS/XB icons with appropriate states
 * - Handles infinite scroll with MutationObserver
 */

const PROCESSED_ATTR = 'data-xcpw-processed';
const ICONS_INJECTED_ATTR = 'data-xcpw-icons';
const LOG_PREFIX = '[Steam Cross-Platform Wishlist]';
const DEBUG = false; // Set to true for verbose debugging

/** Set of appids that have been processed to avoid duplicate logging */
const processedAppIds = new Set();

/** All available platforms in display order */
const ALL_PLATFORMS = ['nintendo', 'playstation', 'xbox', 'steamdeck'];

/** User settings (loaded from storage) */
let userSettings = {
  showSteamDeck: true
};

/** Pre-extracted Steam Deck data from page SSR (Map of appId -> category) */
let steamDeckData = null;

/**
 * Gets the list of enabled platforms based on user settings
 * @returns {string[]}
 */
function getEnabledPlatforms() {
  return ALL_PLATFORMS.filter(platform => {
    if (platform === 'steamdeck') {
      return userSettings.showSteamDeck;
    }
    return true; // Other platforms always shown
  });
}

/**
 * Loads user settings from chrome.storage.sync
 */
async function loadUserSettings() {
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
function extractAppId(item) {
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

/** Price/discount pattern to filter out non-title text */
const PRICE_PATTERN = /^\$|^€|^£|^\d|^Free|^-\d/;

/**
 * Checks if text looks like a valid game title (not a price or short string)
 */
function isValidGameTitle(text) {
  return text && text.length > 2 && text.length < 200 && !PRICE_PATTERN.test(text);
}

/**
 * Extracts the game name from a wishlist item element.
 */
function extractGameName(item) {
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
      return text;
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
 * @param {string} svgString - Static SVG markup
 * @returns {SVGElement | null}
 */
function parseSvg(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.documentElement;

  // Check for parsing errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    console.error(`${LOG_PREFIX} SVG parsing error`);
    return null;
  }

  return svg;
}

// ============================================================================
// Icon Injection
// ============================================================================

/**
 * Creates the platform icons container with initial loading state
 * @param {string} appid
 * @param {string} gameName
 * @returns {HTMLElement}
 */
function createIconsContainer(appid, gameName) {
  const container = document.createElement('span');
  container.className = 'xcpw-platforms';
  container.setAttribute('data-appid', appid);

  // Add separator
  const separator = document.createElement('span');
  separator.className = 'xcpw-separator';
  container.appendChild(separator);

  // Add platform icons in loading state (only enabled platforms)
  const enabledPlatforms = getEnabledPlatforms();
  for (const platform of enabledPlatforms) {
    const icon = createPlatformIcon(platform, 'unknown', gameName);
    icon.classList.add('xcpw-loading');
    container.appendChild(icon);
  }

  return container;
}

/**
 * Creates a single platform icon element
 * @param {string} platform - 'nintendo' | 'playstation' | 'xbox' | 'steamdeck'
 * @param {string} status - 'available' | 'unavailable' | 'unknown'
 * @param {string} gameName - Game name for search URL
 * @param {string} [storeUrl] - Optional direct store URL
 * @param {string} [tier] - Optional ProtonDB tier for Steam Deck
 * @returns {HTMLElement}
 */
function createPlatformIcon(platform, status, gameName, storeUrl, tier) {
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
    icon.setAttribute('href', url);
    icon.setAttribute('target', '_blank');
    icon.setAttribute('rel', 'noopener noreferrer');
  }

  return icon;
}

/**
 * Updates the icons container with platform data from cache.
 * Steam Deck icons are fetched separately from Steam's store pages.
 * Only shows icons for platforms where the game is available:
 * - available: Full opacity, clickable - opens store page
 * - unavailable: Dimmed, shows issues
 * - unknown: Hidden
 * @param {HTMLElement} container
 * @param {Object} data - Cache entry with platform data
 */
function updateIconsWithData(container, data) {
  const gameName = data.gameName;
  const appid = container.getAttribute('data-appid');
  let hasVisibleIcons = false;
  const enabledPlatforms = getEnabledPlatforms();

  // Get Steam Deck client if available
  const SteamDeck = globalThis.XCPW_SteamDeck;

  for (const platform of enabledPlatforms) {
    const oldIcon = container.querySelector(`[data-platform="${platform}"]`);
    if (!oldIcon) continue;

    // Special handling for Steam Deck - use pre-extracted SSR data
    if (platform === 'steamdeck' && SteamDeck && appid && steamDeckData) {
      const deckResult = SteamDeck.getDeckStatus(steamDeckData, appid);
      const displayStatus = SteamDeck.statusToDisplayStatus(deckResult.status);

      // Hide unknown/unsupported Steam Deck games
      if (displayStatus === 'unknown') {
        oldIcon.remove();
        continue;
      }

      // Show verified (available) or playable (unavailable) with appropriate styling
      const newIcon = createPlatformIcon(platform, displayStatus, gameName, null, deckResult.status);
      oldIcon.replaceWith(newIcon);
      hasVisibleIcons = true;
      continue;
    }

    // Console platforms - use Wikidata data
    const platformData = data.platforms[platform];
    const status = platformData?.status || 'unknown';
    const storeUrl = platformData?.storeUrl;

    // Only show icons for available platforms
    if (status === 'available') {
      const newIcon = createPlatformIcon(platform, status, gameName, storeUrl);
      oldIcon.replaceWith(newIcon);
      hasVisibleIcons = true;
    } else {
      // Hide unavailable/unknown platforms
      oldIcon.remove();
    }
  }

  // Hide separator if no icons are visible
  if (!hasVisibleIcons) {
    const separator = container.querySelector('.xcpw-separator');
    if (separator) separator.remove();
  }
}

/**
 * Removes loading state from icons, keeping them as unknown.
 * Icons remain visible and clickable, linking to store search pages.
 * @param {HTMLElement} container - Icons container element
 */
function removeLoadingState(container) {
  for (const icon of container.querySelectorAll('.xcpw-loading')) {
    icon.classList.remove('xcpw-loading');
  }
}

/** Steam platform icon title patterns */
const STEAM_PLATFORM_TITLES = ['Windows', 'macOS', 'Linux', 'SteamOS', 'Steam Deck', 'VR'];

/**
 * Checks if an element is a valid child container of the item (not item itself or parent)
 */
function isValidContainer(item, el) {
  return el && item.contains(el) && el !== item && !el.contains(item);
}

/**
 * Finds the best injection point for our icons (next to OS icons)
 * @param {Element} item - Wishlist item element
 * @returns {{container: Element, insertAfter: Element | null}}
 */
function findInjectionPoint(item) {
  // Primary: Find Steam platform icons by their title attributes
  // CSS order:9999 ensures we display after Steam icons regardless of DOM order
  const platformIcon = item.querySelector('span[title]');
  if (platformIcon) {
    const title = platformIcon.getAttribute('title') || '';
    const isSteamIcon = STEAM_PLATFORM_TITLES.some(t => title.includes(t)) || platformIcon.querySelector('svg');
    if (isSteamIcon) {
      const group = platformIcon.parentElement;
      if (isValidContainer(item, group)) {
        return { container: group, insertAfter: null };
      }
    }
  }

  // Secondary: Find the largest SVG icon group (platform icons are typically grouped)
  const svgIcons = item.querySelectorAll('svg:not(.xcpw-platforms svg)');
  const groupCounts = new Map();
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

  let bestGroup = null;
  let bestInfo = null;
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

/**
 * Requests platform data from background service worker (legacy single-item)
 * @param {string} appid
 * @param {string} gameName
 * @returns {Promise<Object | null>}
 */
async function requestPlatformData(appid, gameName) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PLATFORM_DATA',
      appid,
      gameName
    });

    if (response?.success && response.data) {
      return response;
    }
    return null;
  } catch (error) {
    // Service worker may be inactive - fail silently
    return null;
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

/** Pending items waiting for batch resolution */
const pendingItems = new Map();

/** Debounce timer for batch requests */
let batchDebounceTimer = null;

/** Debounce delay in ms - wait for more items before sending batch */
const BATCH_DEBOUNCE_MS = 100;

/**
 * Queues an item for batch platform data resolution.
 * Uses debouncing to collect multiple items before sending a single batch request.
 * @param {string} appid
 * @param {string} gameName
 * @param {HTMLElement} iconsContainer
 */
function queueForBatchResolution(appid, gameName, iconsContainer) {
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
async function processPendingBatch() {
  if (pendingItems.size === 0) {
    return;
  }

  // Collect all pending items
  const games = [];
  const containerMap = new Map();

  for (const [appid, { gameName, container }] of pendingItems) {
    games.push({ appid, gameName });
    containerMap.set(appid, { container, gameName });
  }

  // Clear pending items before async operation
  pendingItems.clear();
  batchDebounceTimer = null;

  if (DEBUG) console.log(`${LOG_PREFIX} Sending batch request for ${games.length} games`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PLATFORM_DATA_BATCH',
      games
    });

    if (response?.success && response.results) {
      // Update icons for each result
      for (const [appid, result] of Object.entries(response.results)) {
        const itemInfo = containerMap.get(appid);
        if (!itemInfo) continue;

        const { container, gameName } = itemInfo;
        if (result.data) {
          if (DEBUG) console.log(`${LOG_PREFIX} Updating icons for appid ${appid}`);
          updateIconsWithData(container, result.data);

          const source = result.fromCache ? 'cache' : 'new';
          console.log(`${LOG_PREFIX} Rendered (${source}): ${appid} - ${gameName}`);
        } else {
          // No data available - keep icons as unknown (still link to store search)
          removeLoadingState(container);
          if (DEBUG) console.log(`${LOG_PREFIX} No data for appid ${appid}, keeping icons as unknown`);
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
    console.warn(`${LOG_PREFIX} Batch request error:`, error.message);
    for (const { container } of containerMap.values()) {
      removeLoadingState(container);
    }
  }
}

// ============================================================================
// Item Processing
// ============================================================================

/** Set of appids that have icons already injected (survives React re-renders) */
const injectedAppIds = new Set();

/** Retry configuration for lazy-loaded items */
const INJECTION_MAX_RETRIES = 10;
const INJECTION_BASE_DELAY_MS = 150;

/**
 * Waits for SVG icons to appear in lazy-loaded items before finding injection point.
 * Steam's virtualized list loads skeletons first, then adds icons slightly later.
 * @param {Element} item - Wishlist item element
 * @returns {Promise<{container: Element, insertAfter: Element | null} | null>}
 */
async function waitForInjectionPoint(item) {
  for (let attempt = 0; attempt <= INJECTION_MAX_RETRIES; attempt++) {
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
async function processItem(item) {
  // Skip if already processed via attribute
  if (item.hasAttribute(PROCESSED_ATTR)) {
    return;
  }

  // Mark as processed immediately to prevent duplicate processing
  item.setAttribute(PROCESSED_ATTR, 'true');

  const appId = extractAppId(item);
  if (!appId) {
    return;
  }

  // Log new appids (deduplicated) - only on first discovery
  const isNewAppId = !processedAppIds.has(appId);
  if (isNewAppId) {
    processedAppIds.add(appId);
    console.log(`${LOG_PREFIX} Found appid: ${appId}`);
  }

  // Skip if icons already exist in DOM (React may have recreated the element)
  // Check both our tracking set AND the DOM for existing icons
  if (item.querySelector('.xcpw-platforms')) {
    return;
  }

  const gameName = extractGameName(item);

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
  injectedAppIds.add(appId);

  // Queue for batch resolution instead of individual request
  // This dramatically reduces Wikidata API calls by batching multiple games together
  if (DEBUG) console.log(`${LOG_PREFIX} Queuing appid ${appId} for batch resolution`);
  queueForBatchResolution(appId, gameName, iconsContainer);
}

/**
 * Finds and processes all wishlist items in a given root element.
 */
function processWishlistItems(root = document) {
  const selector = '[data-rfd-draggable-id^="WishlistItem-"]:not([' + PROCESSED_ATTR + '])';
  const items = root.querySelectorAll(selector);
  items.forEach(item => processItem(item));
}

// ============================================================================
// MutationObserver
// ============================================================================

/**
 * Sets up a MutationObserver for infinite scroll / virtualized list loading.
 */
function setupObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          // Check if the node itself is a wishlist item
          if (node.hasAttribute?.('data-rfd-draggable-id') &&
            node.getAttribute('data-rfd-draggable-id')?.startsWith('WishlistItem-')) {
            processItem(node);
          }
          // Also check descendants
          processWishlistItems(node);
        }
      }
    }
  });

  // Observe the entire body since the wishlist uses virtualization
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log(`${LOG_PREFIX} MutationObserver attached`);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Main initialization function.
 */
async function init() {
  console.log(`${LOG_PREFIX} Initializing...`);

  if (!PLATFORM_ICONS || !PLATFORM_INFO || !STATUS_INFO) {
    console.error(`${LOG_PREFIX} Missing icon definitions (icons.js not loaded?)`);
    return;
  }

  // Load user settings first
  await loadUserSettings();

  // Load Steam Deck data from page script (runs in MAIN world)
  const SteamDeck = globalThis.XCPW_SteamDeck;
  if (SteamDeck && userSettings.showSteamDeck) {
    steamDeckData = await SteamDeck.waitForDeckData();
  }

  // Process existing items
  processWishlistItems();

  // Set up observer for dynamic content
  setupObserver();

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
    requestPlatformData
  };
}
