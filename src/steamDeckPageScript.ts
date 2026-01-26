/**
 * Steam Cross-Platform Wishlist - Steam Deck Page Script
 *
 * Runs in the MAIN world (page context) to extract Steam Deck compatibility
 * data from window.SSR, storing it in a hidden DOM element for the content
 * script to read.
 *
 * Loaded via script src from web_accessible_resources to bypass CSP.
 */

(function() {
  'use strict';

  const DEBUG = false;
  const LOG_PREFIX = '[SCPW SteamDeck PageScript]';
  const DATA_ELEMENT_ID = 'scpw-steamdeck-data';

  interface TanStackQuery {
    queryKey?: (string | unknown)[];
    state?: {
      data?: {
        steam_deck_compat_category?: number;
      };
    };
  }

  interface QueryData {
    queries?: TanStackQuery[];
    queryData?: string;
  }

  /**
   * Checks if a query entry contains Steam Deck compatibility data.
   */
  function isDeckCompatQuery(query: TanStackQuery): boolean {
    return !!(query.queryKey &&
      query.queryKey[0] === 'StoreItem' &&
      query.state?.data?.steam_deck_compat_category !== undefined);
  }

  /**
   * Extracts appId and deck category from a valid query entry.
   */
  function extractFromQuery(query: TanStackQuery): { appId: string; category: number } {
    const appId = String(query.queryKey![1]).replace('app_', '');
    const category = query.state!.data!.steam_deck_compat_category!;
    return { appId, category };
  }

  /**
   * Extracts Steam Deck data from queries array into mapping object.
   */
  function extractFromQueries(queries: TanStackQuery[], mapping: Record<string, number>): void {
    for (const query of queries) {
      if (isDeckCompatQuery(query)) {
        const { appId, category } = extractFromQuery(query);
        mapping[appId] = category;
      }
    }
  }

  /**
   * Extracts Steam Deck compatibility data from page SSR data.
   */
  function extractDeckData(): Record<string, number> {
    const mapping: Record<string, number> = {};

    try {
      // Primary: window.SSR.renderContext.queryData
      if (window.SSR?.renderContext?.queryData) {
        const queryData = JSON.parse(window.SSR.renderContext.queryData) as QueryData;
        if (Array.isArray(queryData.queries)) {
          extractFromQueries(queryData.queries, mapping);
        }
      }

      // Fallback: window.SSR.loaderData
      if (Object.keys(mapping).length === 0 && window.SSR?.loaderData) {
        for (const jsonStr of window.SSR.loaderData) {
          try {
            const data = JSON.parse(jsonStr) as QueryData;
            const queries = data.queries ||
              (data.queryData && (JSON.parse(data.queryData) as QueryData).queries) ||
              [];
            extractFromQueries(queries, mapping);
          } catch {
            // Ignore parse errors for individual strings
          }
        }
      }

      /* istanbul ignore if */
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
   */
  function storeDataInDOM(data: Record<string, number>): void {
    const existing = document.getElementById(DATA_ELEMENT_ID);
    if (existing) {
      existing.remove();
    }

    const el = document.createElement('script');
    el.type = 'application/json';
    el.id = DATA_ELEMENT_ID;
    el.textContent = JSON.stringify(data);
    document.documentElement.appendChild(el);

    /* istanbul ignore if */
    if (DEBUG) {
      console.log(`${LOG_PREFIX} Stored data in #${DATA_ELEMENT_ID}`);
    }
  }

  // Execute immediately
  const data = extractDeckData();
  storeDataInDOM(data);
})();
