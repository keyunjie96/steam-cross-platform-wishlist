/**
 * Steam Cross-Platform Wishlist - Content Script
 *
 * Extracts Steam appids from wishlist rows and observes for dynamically loaded content.
 */

const PROCESSED_ATTR = 'data-xcpw-processed';
const LOG_PREFIX = '[Steam Cross-Platform Wishlist]';

/** Set of appids that have been processed to avoid duplicate logging */
const processedAppIds = new Set();

/**
 * Extracts the Steam appid from a wishlist item element.
 * Steam's new React-based wishlist uses data-rfd-draggable-id="WishlistItem-{appid}-{index}"
 */
function extractAppId(item) {
  // Method 1: data-rfd-draggable-id attribute (e.g., "WishlistItem-2868840-0")
  const draggableId = item.getAttribute('data-rfd-draggable-id');
  if (draggableId) {
    const match = draggableId.match(/^WishlistItem-(\d+)-/);
    if (match) {
      return match[1];
    }
  }

  // Method 2: Find link to app page
  const appLink = item.querySelector('a[href*="/app/"]');
  if (appLink) {
    const href = appLink.getAttribute('href');
    const match = href?.match(/\/app\/(\d+)/);
    if (match) {
      return match[1];
    }
  }

  // Method 3: data-appid on note elements
  const noteEl = item.querySelector('[data-appid]');
  if (noteEl) {
    const appId = noteEl.getAttribute('data-appid');
    if (appId && /^\d+$/.test(appId)) {
      return appId;
    }
  }

  return null;
}

/**
 * Processes a single wishlist item element.
 */
function processItem(item) {
  if (item.hasAttribute(PROCESSED_ATTR)) {
    return;
  }

  item.setAttribute(PROCESSED_ATTR, 'true');

  const appId = extractAppId(item);
  if (appId && !processedAppIds.has(appId)) {
    processedAppIds.add(appId);
    console.log(`${LOG_PREFIX} Found appid: ${appId}`);
  }
}

/**
 * Finds and processes all wishlist items in a given root element.
 * Targets elements with data-rfd-draggable-id starting with "WishlistItem-"
 */
function processWishlistItems(root = document) {
  const items = root.querySelectorAll('[data-rfd-draggable-id^="WishlistItem-"]:not([' + PROCESSED_ATTR + '])');
  items.forEach(processItem);
}

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

/**
 * Main initialization function.
 */
function init() {
  console.log(`${LOG_PREFIX} Initializing on wishlist page...`);
  processWishlistItems();
  setupObserver();
  console.log(`${LOG_PREFIX} Initialization complete. Found ${processedAppIds.size} appids.`);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
