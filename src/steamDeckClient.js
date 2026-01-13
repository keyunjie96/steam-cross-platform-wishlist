/**
 * Steam Cross-Platform Wishlist - Steam Deck Client
 *
 * Injects steamDeckPageScript.js into the MAIN world via script src
 * (using web_accessible_resources) to access window.SSR and extract
 * Steam Deck Verified status. Data is stored in a hidden DOM element.
 * 
 * Categories: verified (3), playable (2), unsupported (1), unknown (0)
 */

const STEAM_DECK_DEBUG = true;
const STEAM_DECK_LOG_PREFIX = '[XCPW SteamDeck]';
const DATA_ELEMENT_ID = 'xcpw-steamdeck-data';

/**
 * Steam Deck Verified categories from Steam
 */
const CATEGORY_MAP = {
    0: 'unknown',
    1: 'unsupported',
    2: 'playable',
    3: 'verified'
};

/**
 * Injects the page script into the MAIN world by loading it via script src.
 * This bypasses CSP restrictions on inline scripts.
 */
function injectPageScript() {
    if (STEAM_DECK_DEBUG) {
        console.log(`${STEAM_DECK_LOG_PREFIX} Injecting page script via src...`);
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/steamDeckPageScript.js');
    script.onload = function () {
        if (STEAM_DECK_DEBUG) {
            console.log(`${STEAM_DECK_LOG_PREFIX} Page script loaded`);
        }
        this.remove(); // Clean up after execution
    };
    script.onerror = function () {
        console.error(`${STEAM_DECK_LOG_PREFIX} Failed to load page script`);
    };
    (document.head || document.documentElement).appendChild(script);
}

/**
 * Reads Steam Deck compatibility data from the hidden DOM element.
 * @returns {Map<string, number>} Map of appId to deck category
 */
function extractDeckDataFromPage() {
    const mapping = new Map();

    try {
        const dataElement = document.getElementById(DATA_ELEMENT_ID);

        if (!dataElement) {
            return mapping;
        }

        const data = JSON.parse(dataElement.textContent || '{}');

        for (const [appId, category] of Object.entries(data)) {
            mapping.set(appId, category);
        }

        if (STEAM_DECK_DEBUG) {
            console.log(`${STEAM_DECK_LOG_PREFIX} Read ${mapping.size} games from DOM element`);
        }
    } catch (error) {
        console.error(`${STEAM_DECK_LOG_PREFIX} Error reading DOM element:`, error);
    }

    return mapping;
}

/**
 * Waits for the page script to populate the data element.
 * @param {number} maxWaitMs - Maximum time to wait
 * @returns {Promise<Map<string, number>>}
 */
async function waitForDeckData(maxWaitMs = 3000) {
    // First, inject the page script
    injectPageScript();

    // Give it time to load and execute
    await new Promise(r => setTimeout(r, 200));

    const startTime = Date.now();
    const pollIntervalMs = 100;

    while (Date.now() - startTime < maxWaitMs) {
        const data = extractDeckDataFromPage();
        if (data.size > 0) {
            return data;
        }
        await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    if (STEAM_DECK_DEBUG) {
        console.log(`${STEAM_DECK_LOG_PREFIX} Timed out waiting for data`);
    }
    return new Map();
}

/**
 * Gets deck status for a specific appId
 */
function getDeckStatus(deckData, appId) {
    const category = deckData.get(appId);

    if (category === undefined) {
        return {
            found: false,
            status: 'unknown',
            category: 0
        };
    }

    return {
        found: true,
        status: CATEGORY_MAP[category] || 'unknown',
        category
    };
}

/**
 * Converts deck status to display status for icons
 */
function statusToDisplayStatus(status) {
    switch (status) {
        case 'verified':
            return 'available';
        case 'playable':
            return 'unavailable';
        case 'unsupported':
        case 'unknown':
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
