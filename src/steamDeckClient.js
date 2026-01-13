/**
 * Steam Cross-Platform Wishlist - Steam Deck Client
 *
 * Injects steamDeckPageScript.js into the MAIN world via script src
 * (using web_accessible_resources) to access window.SSR and extract
 * Steam Deck Verified status. Data is stored in a hidden DOM element.
 * 
 * Categories: verified (3), playable (2), unsupported (1), unknown (0)
 */

const STEAM_DECK_DEBUG = false;
const STEAM_DECK_LOG_PREFIX = '[XCPW SteamDeck]';
const DATA_ELEMENT_ID = 'xcpw-steamdeck-data';

/** @typedef {0 | 1 | 2 | 3} DeckCategory */
/** @typedef {'unknown' | 'unsupported' | 'playable' | 'verified'} DeckStatus */

const CATEGORY_MAP = {
    0: 'unknown',
    1: 'unsupported',
    2: 'playable',
    3: 'verified'
};

/**
 * Injects the page script into the MAIN world by loading it via script src.
 * This bypasses CSP restrictions on inline scripts.
 * @returns {Promise<void>} Resolves when script has loaded
 */
function injectPageScript() {
    return new Promise((resolve, reject) => {
        if (STEAM_DECK_DEBUG) {
            console.log(`${STEAM_DECK_LOG_PREFIX} Injecting page script...`);
        }

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/steamDeckPageScript.js');
        script.onload = function () {
            if (STEAM_DECK_DEBUG) {
                console.log(`${STEAM_DECK_LOG_PREFIX} Page script loaded`);
            }
            this.remove();
            resolve();
        };
        script.onerror = function () {
            console.error(`${STEAM_DECK_LOG_PREFIX} Failed to load page script`);
            reject(new Error('Failed to load Steam Deck page script'));
        };
        (document.head || document.documentElement).appendChild(script);
    });
}

/**
 * Reads Steam Deck compatibility data from the hidden DOM element.
 * @returns {Map<string, DeckCategory>} Map of appId to deck category
 */
function extractDeckDataFromPage() {
    const dataElement = document.getElementById(DATA_ELEMENT_ID);
    if (!dataElement) {
        return new Map();
    }

    try {
        const data = JSON.parse(dataElement.textContent || '{}');
        const mapping = new Map(Object.entries(data));

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
 * @param {number} maxWaitMs - Maximum time to wait (default 3000ms)
 * @returns {Promise<Map<string, DeckCategory>>}
 */
async function waitForDeckData(maxWaitMs = 3000) {
    try {
        await injectPageScript();
    } catch (error) {
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

/**
 * Gets deck status for a specific appId from extracted data.
 * @param {Map<string, DeckCategory>} deckData - Extracted deck data
 * @param {string} appId - Steam app ID
 * @returns {{found: boolean, status: DeckStatus, category: DeckCategory}}
 */
function getDeckStatus(deckData, appId) {
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
 * - verified → available (white icon)
 * - playable → unavailable (dimmed icon)
 * - unsupported/unknown → unknown (hidden)
 * @param {DeckStatus} status
 * @returns {'available' | 'unavailable' | 'unknown'}
 */
function statusToDisplayStatus(status) {
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
