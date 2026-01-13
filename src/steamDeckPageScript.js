/**
 * Steam Cross-Platform Wishlist - Steam Deck Page Script
 * 
 * This script runs in the MAIN world (page context) and extracts
 * Steam Deck compatibility data from window.SSR, storing it in a
 * hidden DOM element for the content script to read.
 * 
 * Loaded via script src from web_accessible_resources to bypass CSP.
 */

(function () {
    'use strict';

    const DEBUG = true;
    const LOG_PREFIX = '[XCPW SteamDeck PageScript]';
    const DATA_ELEMENT_ID = 'xcpw-steamdeck-data';

    function extractDeckData() {
        const mapping = {};

        try {
            // Primary: window.SSR.renderContext.queryData (string containing JSON)
            if (window.SSR?.renderContext?.queryData) {
                const queryData = JSON.parse(window.SSR.renderContext.queryData);
                if (queryData.queries && Array.isArray(queryData.queries)) {
                    for (const q of queryData.queries) {
                        if (q.queryKey &&
                            q.queryKey[0] === 'StoreItem' &&
                            q.queryKey[2] === 'include_platforms' &&
                            q.state?.data?.steam_deck_compat_category !== undefined) {
                            const appId = q.queryKey[1].replace('app_', '');
                            mapping[appId] = q.state.data.steam_deck_compat_category;
                        }
                    }
                }
            }

            // Fallback: window.SSR.loaderData
            if (Object.keys(mapping).length === 0 && window.SSR?.loaderData) {
                for (const jsonStr of window.SSR.loaderData) {
                    try {
                        const data = JSON.parse(jsonStr);
                        const queries = data.queries || (data.queryData && JSON.parse(data.queryData).queries) || [];
                        for (const q of queries) {
                            if (q.queryKey &&
                                q.queryKey[0] === 'StoreItem' &&
                                q.queryKey[2] === 'include_platforms' &&
                                q.state?.data?.steam_deck_compat_category !== undefined) {
                                const appId = q.queryKey[1].replace('app_', '');
                                mapping[appId] = q.state.data.steam_deck_compat_category;
                            }
                        }
                    } catch (e) { }
                }
            }

            if (DEBUG) {
                console.log(LOG_PREFIX + ' Extracted ' + Object.keys(mapping).length + ' games');
            }
        } catch (error) {
            console.error(LOG_PREFIX + ' Error:', error);
        }

        return mapping;
    }

    function storeDataInDOM(data) {
        const existing = document.getElementById(DATA_ELEMENT_ID);
        if (existing) existing.remove();

        const el = document.createElement('script');
        el.type = 'application/json';
        el.id = DATA_ELEMENT_ID;
        el.textContent = JSON.stringify(data);
        document.documentElement.appendChild(el);

        if (DEBUG) {
            console.log(LOG_PREFIX + ' Stored data in #' + DATA_ELEMENT_ID);
        }
    }

    const data = extractDeckData();
    storeDataInDOM(data);
})();
