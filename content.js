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

// ============================================================================
// Icon Definitions (loaded from icons.js)
// ============================================================================

const PLATFORM_ICONS = globalThis.XCPW_Icons;
const PLATFORM_INFO = globalThis.XCPW_PlatformInfo;

// ============================================================================
// Store URL Builders
// ============================================================================

// Region-agnostic URLs - stores will redirect to user's local version
const StoreUrls = {
  nintendo: (gameName) =>
    `https://www.nintendo.com/search/#q=${encodeURIComponent(gameName)}&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch`,

  playstation: (gameName) =>
    `https://store.playstation.com/search/${encodeURIComponent(gameName)}`,

  xbox: (gameName) =>
    `https://www.xbox.com/search?q=${encodeURIComponent(gameName)}`
};

// ============================================================================
// CSS Injection
// ============================================================================

/**
 * Injects our scoped CSS into the page
 */
function injectStyles() {
  if (document.getElementById('xcpw-styles')) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'xcpw-styles';
  style.textContent = `
    .xcpw-platforms {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 6px;
      vertical-align: middle;
      color: #ffffff;
    }

    .xcpw-platform-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 17px;
      height: 17px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      text-decoration: none;
      transition: opacity 0.15s ease, transform 0.15s ease;
      position: relative;
      color: inherit;
    }

    .xcpw-platform-icon:link,
    .xcpw-platform-icon:visited {
      color: inherit;
    }

    .xcpw-platform-icon svg {
      width: 16px;
      height: 16px;
      display: block;
    }

    .xcpw-platform-icon.xcpw-available {
      opacity: 1;
    }

    .xcpw-platform-icon.xcpw-available:hover {
      opacity: 1;
      transform: scale(1.1);
    }

    .xcpw-platform-icon.xcpw-unknown {
      opacity: 1;
    }

    .xcpw-platform-icon.xcpw-unknown:hover {
      opacity: 1;
      transform: scale(1.05);
    }

    .xcpw-platform-icon.xcpw-unavailable {
      opacity: 0.35;
      cursor: default;
    }

    .xcpw-platform-icon.xcpw-loading {
      animation: xcpw-pulse 1s ease-in-out infinite;
    }

    @keyframes xcpw-pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.6; }
    }

    .xcpw-separator {
      width: 1px;
      height: 12px;
      background: #3d4450;
      margin: 0 3px;
      display: inline-block;
      vertical-align: middle;
    }

    .xcpw-platform-icon:focus {
      outline: 1px solid #66c0f4;
      outline-offset: 2px;
    }

    .xcpw-platform-icon:focus:not(:focus-visible) {
      outline: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .xcpw-platform-icon {
        transition: none;
      }
      .xcpw-platform-icon.xcpw-loading {
        animation: none;
        opacity: 0.4;
      }
    }
  `;

  document.head.appendChild(style);
  console.log(`${LOG_PREFIX} Styles injected`);
}

// ============================================================================
// Appid Extraction
// ============================================================================

/**
 * Extracts the Steam appid from a wishlist item element.
 * Steam's new React-based wishlist uses data-rfd-draggable-id="WishlistItem-{appid}-{index}"
 */
function extractAppId(item) {
  // Method 1: data-rfd-draggable-id attribute
  const draggableId = item.getAttribute('data-rfd-draggable-id');
  if (draggableId) {
    const match = draggableId.match(/^WishlistItem-(\d+)-/);
    if (match) return match[1];
  }

  // Method 2: Find link to app page
  const appLink = item.querySelector('a[href*="/app/"]');
  if (appLink) {
    const href = appLink.getAttribute('href');
    const match = href?.match(/\/app\/(\d+)/);
    if (match) return match[1];
  }

  // Method 3: data-appid on note elements
  const noteEl = item.querySelector('[data-appid]');
  if (noteEl) {
    const appId = noteEl.getAttribute('data-appid');
    if (appId && /^\d+$/.test(appId)) return appId;
  }

  return null;
}

/**
 * Extracts the game name from a wishlist item element.
 */
function extractGameName(item) {
  // Method 1: Look for the title link (most reliable)
  // Steam's title links go to /app/{appid}/{game-name-slug}
  const titleLink = item.querySelector('a[href*="/app/"]');
  if (titleLink) {
    // First try the link's text content
    const linkText = titleLink.textContent?.trim();
    if (linkText && linkText.length > 0 && linkText.length < 200) {
      return linkText;
    }

    // Fallback: Extract from URL slug
    const href = titleLink.getAttribute('href');
    const match = href?.match(/\/app\/\d+\/([^/?]+)/);
    if (match) {
      // Convert slug to title: "hollow_knight" -> "Hollow Knight"
      return match[1]
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Method 2: Try various class-based selectors
  const titleSelectors = [
    '[class*="Title"]',
    '[class*="title"]',
    '[class*="Name"]',
    '[class*="name"]'
  ];

  for (const selector of titleSelectors) {
    const el = item.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim();
      // Filter out prices, dates, and other short strings
      if (text && text.length > 2 && text.length < 200 && !/^\$|^€|^£|^\d/.test(text)) {
        return text;
      }
    }
  }

  // Method 3: Find the largest text block that's likely the title
  const textNodes = [];
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (text && text.length > 3 && text.length < 100) {
      textNodes.push(text);
    }
  }
  // Return the first substantial text that's not a price
  for (const text of textNodes) {
    if (!/^\$|^€|^£|^\d|^Free|^-\d/.test(text)) {
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
  const info = PLATFORM_INFO[platform];
  const url = storeUrl || StoreUrls[platform](gameName);

  // Create as anchor for available/unknown, span for unavailable
  const isClickable = status !== 'unavailable';
  const icon = document.createElement(isClickable ? 'a' : 'span');

  icon.className = `xcpw-platform-icon xcpw-${status}`;
  icon.setAttribute('data-platform', platform);

  // Parse and append SVG safely using DOMParser
  const svg = parseSvg(PLATFORM_ICONS[platform]);
  if (svg) {
    icon.appendChild(svg);
  }

  // Set tooltip
  let tooltip;
  switch (status) {
    case 'available':
      tooltip = `${info.name}: Available - Click to view`;
      break;
    case 'unavailable':
      tooltip = `${info.name}: Not available`;
      break;
    default:
      tooltip = `${info.name}: Unknown - Click to search`;
  }
  icon.setAttribute('title', tooltip);

  // Set link attributes for clickable icons
  if (isClickable) {
    icon.setAttribute('href', url);
    icon.setAttribute('target', '_blank');
    icon.setAttribute('rel', 'noopener noreferrer');
  }

  return icon;
}

/**
 * Updates the icons container with platform data from cache.
 * Only shows icons for platforms where the game is available.
 * Hides icons for unavailable or unknown platforms.
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

  // If no platforms are available, also hide the separator
  if (!hasVisibleIcons) {
    const separator = container.querySelector('.xcpw-separator');
    if (separator) separator.remove();
  }
}

/**
 * Finds the best injection point for our icons (next to OS icons)
 * @param {Element} item - Wishlist item element
 * @returns {{container: Element, insertAfter: Element | null} | null}
 */
function findInjectionPoint(item) {
  // Steam's React UI uses hashed class names, so we use structural queries
  // and look for SVG platform icons which are more stable

  // Method 1: Find ALL Steam platform icons using their title attributes
  // Steam uses spans with title="Windows", "macOS", "Linux / SteamOS", "Steam Deck"
  // This is more stable than relying on hashed CSS class names or SVG classes
  // Structure: div -> span (group) -> span[title] (wrapper) -> svg
  // We want to insert inside the group, after the LAST platform icon wrapper
  const platformTitles = ['Windows', 'macOS', 'Linux / SteamOS', 'Linux', 'Steam Deck'];
  const platformIcons = Array.from(item.querySelectorAll('span[title]')).filter(span =>
    platformTitles.some(title => span.getAttribute('title')?.includes(title))
  );

  if (platformIcons.length > 0) {
    // Get the last platform icon's wrapper to insert after all Steam icons
    const lastIcon = platformIcons[platformIcons.length - 1];
    const group = lastIcon.parentElement;
    if (group && item.contains(group) && !group.contains(item)) {
      // Insert inside the group, after the LAST platform icon
      return { container: group, insertAfter: lastIcon };
    }
  }

  // Method 1b: Fallback - find any small SVG icons grouped together
  const svgIcons = Array.from(item.querySelectorAll('svg:not(.xcpw-platforms svg)'));
  const groupInfo = new Map();

  for (const svg of svgIcons) {
    if (svg.closest('.xcpw-platforms')) {
      continue;
    }

    const parent = svg.parentElement;
    if (!parent) {
      continue;
    }

    const group = parent.parentElement || parent;
    // IMPORTANT: Ensure the group is INSIDE the item, not a parent/ancestor of it
    if (!item.contains(group) || group.contains(item)) {
      continue;
    }

    const info = groupInfo.get(group) || { count: 0, lastWrapper: parent };
    info.count += 1;
    info.lastWrapper = parent;
    groupInfo.set(group, info);
  }

  let bestGroup = null;
  let bestInfo = null;
  for (const [group, info] of groupInfo.entries()) {
    if (!bestInfo || info.count > bestInfo.count) {
      bestGroup = group;
      bestInfo = info;
    }
  }

  if (bestGroup && bestInfo) {
    return { container: bestGroup, insertAfter: bestInfo.lastWrapper };
  }

  // Method 2: Look for elements with platform-related class fragments
  const platformSelectors = [
    '[class*="Platform"]',
    '[class*="platform"]',
    '[class*="Compat"]',
    '[class*="compat"]'
  ];
  for (const selector of platformSelectors) {
    const matches = item.querySelectorAll(selector);
    if (matches.length) {
      const el = matches[matches.length - 1];
      const container = el.parentElement || el;
      // IMPORTANT: Ensure container is inside the item
      if (item.contains(container) && container !== item) {
        return { container, insertAfter: el };
      }
    }
  }

  // Method 3: Find the game title link and inject after it
  // The title link always contains /app/{appid}
  const titleLink = item.querySelector('a[href*="/app/"]');
  if (titleLink) {
    // Insert after the title's parent container
    const titleContainer = titleLink.parentElement;
    if (titleContainer && titleContainer !== item) {
      const parent = titleContainer.parentElement;
      // IMPORTANT: Ensure parent is inside the item, not outside
      if (parent && item.contains(parent) && parent !== item) {
        return { container: parent, insertAfter: titleContainer };
      }
      // Fallback: if titleContainer is directly inside item, append to it
      if (item.contains(titleContainer)) {
        return { container: titleContainer, insertAfter: null };
      }
    }
  }

  // Method 4: Last resort - find any container with text that looks like game info
  // and append to the first div after the image
  const firstImg = item.querySelector('img');
  if (firstImg) {
    let sibling = firstImg.parentElement?.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === 'DIV' && sibling.textContent?.trim()) {
        // IMPORTANT: Ensure sibling is inside the item
        if (item.contains(sibling)) {
          return { container: sibling, insertAfter: null };
        }
      }
      sibling = sibling.nextElementSibling;
    }
  }

  // Final fallback: append to the end of the item itself
  // This ensures icons are always placed inside the wishlist item
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

/**
 * Waits for the correct injection point to appear in lazy-loaded items.
 * Steam's virtualized list loads item skeletons first, then adds SVG icons slightly later.
 * This function retries finding the SVG icons with exponential backoff.
 * @param {Element} item - Wishlist item element
 * @param {number} maxRetries - Maximum retry attempts (default: 10)
 * @param {number} baseDelayMs - Initial delay between retries in ms (default: 150)
 * @returns {Promise<{container: Element, insertAfter: Element | null} | null>}
 */
async function waitForInjectionPoint(item, maxRetries = 10, baseDelayMs = 150) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check if SVG icons exist in the item
    const svg = item.querySelector('svg[class*="SVGIcon_"]');
    if (svg) {
      // Found SVG icons, now get the proper injection point
      const injectionPoint = findInjectionPoint(item);
      if (injectionPoint) {
        return injectionPoint;
      }
    }

    // If this is the last attempt, don't wait
    if (attempt === maxRetries) {
      break;
    }

    // Wait with exponential backoff before retrying
    const delay = baseDelayMs * Math.pow(1.5, attempt);
    await new Promise(r => setTimeout(r, delay));
  }

  // No SVG icons found after retries, return null (caller will use fallback)
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

  // Skip if we've already injected for this appid (handles React re-renders)
  if (injectedAppIds.has(appId)) {
    // Re-inject since React removed our icons
    // But don't log again
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
    // No data available - hide all icons and separator (will retry on next page load)
    while (iconsContainer.firstChild) {
      iconsContainer.removeChild(iconsContainer.firstChild);
    }
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

  if (!PLATFORM_ICONS || !PLATFORM_INFO) {
    console.error(`${LOG_PREFIX} Missing icon definitions (icons.js not loaded?)`);
    return;
  }

  // Inject CSS first
  injectStyles();

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
