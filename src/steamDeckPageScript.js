/**
 * Steam Cross-Platform Wishlist - Steam Deck Page Script
 * 
 * Runs in the MAIN world (page context) to extract Steam Deck compatibility
 * data from window.SSR, storing it in a hidden DOM element for the content
 * script to read.
 * 
 * Loaded via script src from web_accessible_resources to bypass CSP.
 */

(function () {
    'use strict';

    const DEBUG = false;
    const LOG_PREFIX = '[XCPW SteamDeck PageScript]';
    const DATA_ELEMENT_ID = 'xcpw-steamdeck-data';

    /**
     * Checks if a query entry contains Steam Deck compatibility data.
     * @param {Object} query - TanStack Query cache entry
     * @returns {boolean}
     */
    function isDeckCompatQuery(query) {
        return query.queryKey &&
            query.queryKey[0] === 'StoreItem' &&
            query.queryKey.includes('include_platforms') &&
            query.state?.data?.steam_deck_compat_category !== undefined;
    }

    /**
     * Extracts appId and deck category from a valid query entry.
     * @param {Object} query - TanStack Query cache entry
     * @returns {{appId: string, category: number}}
     */
    function extractFromQuery(query) {
        const appId = query.queryKey[1].replace('app_', '');
        const category = query.state.data.steam_deck_compat_category;
        return { appId, category };
    }

    /**
     * Extracts Steam Deck data from queries array into mapping object.
     * @param {Array} queries - Array of TanStack Query entries
     * @param {Object} mapping - Output object to populate
     */
    function extractFromQueries(queries, mapping) {
        for (const query of queries) {
            if (isDeckCompatQuery(query)) {
                const { appId, category } = extractFromQuery(query);
                mapping[appId] = category;
            }
        }
    }

    /**
     * Extracts Steam Deck compatibility data from page SSR data.
     * @returns {Object} Map of appId to deck category
     */
    function extractDeckData() {
        const mapping = {};

        try {
            // Primary: window.SSR.renderContext.queryData
            if (window.SSR?.renderContext?.queryData) {
                const queryData = JSON.parse(window.SSR.renderContext.queryData);
                if (Array.isArray(queryData.queries)) {
                    extractFromQueries(queryData.queries, mapping);
                }
            }

            // Fallback: window.SSR.loaderData
            if (Object.keys(mapping).length === 0 && window.SSR?.loaderData) {
                for (const jsonStr of window.SSR.loaderData) {
                    try {
                        const data = JSON.parse(jsonStr);
                        const queries = data.queries ||
                            (data.queryData && JSON.parse(data.queryData).queries) ||
                            [];
                        extractFromQueries(queries, mapping);
                    } catch (e) {
                        // Ignore parse errors for individual strings
                    }
                }
            }

            if (DEBUG) {
                console.log(`${LOG_PREFIX} Extracted ${Object.keys(mapping).length} games`);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} Error:`, error);
        }

        return mapping;
    }

    /**
     * Stores extracted data in a hidden DOM element for content script access.
     * @param {Object} data - Mapping to store
     */
    function storeDataInDOM(data) {
        const existing = document.getElementById(DATA_ELEMENT_ID);
        if (existing) {
            existing.remove();
        }

        const el = document.createElement('script');
        el.type = 'application/json';
        el.id = DATA_ELEMENT_ID;
        el.textContent = JSON.stringify(data);
        document.documentElement.appendChild(el);

        if (DEBUG) {
            console.log(`${LOG_PREFIX} Stored data in #${DATA_ELEMENT_ID}`);
        }
    }

    // Execute immediately
    const data = extractDeckData();
    storeDataInDOM(data);
})();
