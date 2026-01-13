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

/** Platforms in display order */
const PLATFORMS = ['nintendo', 'playstation', 'xbox'];

// Definitions loaded from types.js and icons.js
const StoreUrls = globalThis.XCPW_StoreUrls;
const PLATFORM_ICONS = globalThis.XCPW_Icons;
const PLATFORM_INFO = globalThis.XCPW_PlatformInfo;
const STATUS_INFO = globalThis.XCPW_StatusInfo;

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

  // Add platform icons in loading state
  for (const platform of PLATFORMS) {
    const icon = createPlatformIcon(platform, 'unknown', gameName);
    icon.classList.add('xcpw-loading');
    container.appendChild(icon);
  }

  return container;
}

/**
 * Creates a single platform icon element
 * @param {string} platform - 'nintendo' | 'playstation' | 'xbox'
 * @param {string} status - 'available' | 'unavailable' | 'unknown'
 * @param {string} gameName - Game name for search URL
 * @param {string} [storeUrl] - Optional direct store URL
 * @returns {HTMLElement}
 */
function createPlatformIcon(platform, status, gameName, storeUrl) {
  const url = storeUrl || StoreUrls[platform](gameName);
  const isClickable = status !== 'unavailable';
  const icon = document.createElement(isClickable ? 'a' : 'span');

  icon.className = `xcpw-platform-icon xcpw-${status}`;
  icon.setAttribute('data-platform', platform);
  icon.setAttribute('title', STATUS_INFO[status].tooltip(platform));

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
 * Only shows icons for platforms where the game is available:
 * - available: Full opacity, clickable - opens store page
 * - unavailable: Hidden
 * - unknown: Hidden
 * @param {HTMLElement} container
 * @param {Object} data - Cache entry with platform data
 */
function updateIconsWithData(container, data) {
  const gameName = data.gameName;
  let hasVisibleIcons = false;

  for (const platform of PLATFORMS) {
    const oldIcon = container.querySelector(`[data-platform="${platform}"]`);
    if (!oldIcon) continue;

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
 * Requests platform data from background service worker
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

  // Request platform data from background (async)
  if (DEBUG) console.log(`${LOG_PREFIX} Sending message to background for appid ${appId}`);
  const response = await requestPlatformData(appId, gameName);

  if (response?.data) {
    if (DEBUG) console.log(`${LOG_PREFIX} Updating icons for appid ${appId} with data:`, response.data.platforms);
    // Update icons with actual data
    updateIconsWithData(iconsContainer, response.data);

    // Only log on first injection, not re-injections
    if (isNewAppId) {
      const source = response.fromCache ? 'cache' : 'new';
      console.log(`${LOG_PREFIX} Rendered (${source}): ${appId} - ${gameName}`);
    }
  } else {
    // No data available - keep icons in loading state removed, show as unknown
    // Icons still link to store search pages for manual verification
    for (const icon of iconsContainer.querySelectorAll('.xcpw-loading')) {
      icon.classList.remove('xcpw-loading');
    }
    if (DEBUG) console.log(`${LOG_PREFIX} No data for appid ${appId}, keeping icons as unknown`);
  }
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
function init() {
  console.log(`${LOG_PREFIX} Initializing...`);

  if (!PLATFORM_ICONS || !PLATFORM_INFO || !STATUS_INFO) {
    console.error(`${LOG_PREFIX} Missing icon definitions (icons.js not loaded?)`);
    return;
  }

  // Process existing items
  processWishlistItems();

  // Set up observer for dynamic content
  setupObserver();

  console.log(`${LOG_PREFIX} Initialization complete. Found ${processedAppIds.size} appids.`);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
