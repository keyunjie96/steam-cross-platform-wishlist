/**
 * Steam Cross-Platform Wishlist - Steam Deck Client
 *
 * Injects steamDeckPageScript.js into the MAIN world via script src
 * (using web_accessible_resources) to access window.SSR and extract
 * Steam Deck Verified status. Data is stored in a hidden DOM element.
 *
 * Categories: verified (3), playable (2), unsupported (1), unknown (0)
 */

import type { DeckCategory, DeckStatus } from './types';

const STEAM_DECK_DEBUG = false;
const STEAM_DECK_LOG_PREFIX = '[XCPW SteamDeck]';
const DATA_ELEMENT_ID = 'xcpw-steamdeck-data';

const CATEGORY_MAP: Record<DeckCategory, DeckStatus> = {
  0: 'unknown',
  1: 'unsupported',
  2: 'playable',
  3: 'verified'
};

/**
 * Injects the page script into the MAIN world by loading it via script src.
 * This bypasses CSP restrictions on inline scripts.
 */
function injectPageScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (STEAM_DECK_DEBUG) {
      console.log(`${STEAM_DECK_LOG_PREFIX} Injecting page script...`);
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/steamDeckPageScript.js');
    script.onload = () => {
      if (STEAM_DECK_DEBUG) {
        console.log(`${STEAM_DECK_LOG_PREFIX} Page script loaded`);
      }
      script.remove();
      resolve();
    };
    script.onerror = function() {
      console.error(`${STEAM_DECK_LOG_PREFIX} Failed to load page script`);
      reject(new Error('Failed to load Steam Deck page script'));
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

/**
 * Reads Steam Deck compatibility data from the hidden DOM element.
 */
function extractDeckDataFromPage(): Map<string, DeckCategory> {
  const dataElement = document.getElementById(DATA_ELEMENT_ID);
  if (!dataElement) {
    return new Map();
  }

  try {
    const data = JSON.parse(dataElement.textContent || '{}') as Record<string, DeckCategory>;
    const mapping = new Map<string, DeckCategory>(Object.entries(data));

    if (STEAM_DECK_DEBUG) {
      console.log(`${STEAM_DECK_LOG_PREFIX} Read ${mapping.size} games from DOM`);
    }
    return mapping;
  } catch (error) {
    console.error(`${STEAM_DECK_LOG_PREFIX} Error reading DOM element:`, error);
    return new Map();
  }
}

/**
 * Waits for the page script to populate the data element.
 */
async function waitForDeckData(maxWaitMs = 3000): Promise<Map<string, DeckCategory>> {
  try {
    await injectPageScript();
  } catch {
    return new Map();
  }

  const startTime = Date.now();
  const pollIntervalMs = 100;

  while (Date.now() - startTime < maxWaitMs) {
    const data = extractDeckDataFromPage();
    if (data.size > 0) {
      return data;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  if (STEAM_DECK_DEBUG) {
    console.log(`${STEAM_DECK_LOG_PREFIX} Timed out waiting for data`);
  }
  return new Map();
}

interface DeckStatusResult {
  found: boolean;
  status: DeckStatus;
  category: DeckCategory;
}

/**
 * Gets deck status for a specific appId from extracted data.
 */
function getDeckStatus(deckData: Map<string, DeckCategory>, appId: string): DeckStatusResult {
  const category = deckData.get(appId);

  if (category === undefined) {
    return { found: false, status: 'unknown', category: 0 };
  }

  return {
    found: true,
    status: CATEGORY_MAP[category] || 'unknown',
    category
  };
}

/**
 * Converts deck status to display status for icons.
 * - verified -> available (white icon)
 * - playable -> unavailable (dimmed icon)
 * - unsupported/unknown -> unknown (hidden)
 */
function statusToDisplayStatus(status: DeckStatus): 'available' | 'unavailable' | 'unknown' {
  switch (status) {
    case 'verified':
      return 'available';
    case 'playable':
      return 'unavailable';
    default:
      return 'unknown';
  }
}

// Export for content script
globalThis.XCPW_SteamDeck = {
  extractDeckDataFromPage,
  waitForDeckData,
  getDeckStatus,
  statusToDisplayStatus,
  CATEGORY_MAP
};

// Also export for module imports in tests
export {
  extractDeckDataFromPage,
  waitForDeckData,
  getDeckStatus,
  statusToDisplayStatus,
  CATEGORY_MAP,
  injectPageScript
};
