/**
 * Steam Cross-Platform Wishlist - HLTB Client
 *
 * Queries HowLongToBeat for game completion time estimates.
 * Uses declarativeNetRequest to modify Origin header for direct API access.
 *
 * Note: HLTB has no official API. This uses the internal search endpoint.
 * The API validates Origin header, so we use declarativeNetRequest to set it.
 */

import type { HltbSearchResult } from './types';

const HLTB_BASE_URL = 'https://howlongtobeat.com';
const HLTB_LOG_PREFIX = '[SCPW HLTB]';
const HLTB_DEBUG = false;

const REQUEST_DELAY_MS = 500;
const RULE_ID_ORIGIN = 1;

let requestQueue = Promise.resolve();
let rulesRegistered = false;

/**
 * Registers declarativeNetRequest rules to modify headers for HLTB requests.
 * This allows direct API access by setting the correct Origin header.
 */
async function registerHeaderRules(): Promise<void> {
  if (rulesRegistered) return;

  try {
    // Remove any existing rules first
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map(r => r.id);
    if (existingIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds
      });
    }

    // Add rules to modify Origin and Referer headers for HLTB API requests
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: RULE_ID_ORIGIN,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
              {
                header: 'Origin',
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: HLTB_BASE_URL
              },
              {
                header: 'Referer',
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: `${HLTB_BASE_URL}/`
              }
            ]
          },
          condition: {
            urlFilter: `${HLTB_BASE_URL}/api/*`,
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST]
          }
        }
      ]
    });

    rulesRegistered = true;
    if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Header modification rules registered`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${HLTB_LOG_PREFIX} Failed to register header rules:`, errorMessage);
  }
}

/**
 * Formats hours for display (e.g., "12.5h" or "100h")
 */
function formatHours(hours: number): string {
  if (!hours || hours <= 0) return '';
  // Round to whole number if >= 10, otherwise show one decimal
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

/**
 * Normalizes a game name for fuzzy matching
 */
function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calculates similarity between two strings (0-1)
 * Uses Jaccard similarity on character n-grams
 */
function calculateSimilarity(a: string, b: string): number {
  const aNorm = normalizeGameName(a);
  const bNorm = normalizeGameName(b);

  if (aNorm === bNorm) return 1;
  if (!aNorm || !bNorm) return 0;

  // Simple containment check
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    const shorter = aNorm.length < bNorm.length ? aNorm : bNorm;
    const longer = aNorm.length >= bNorm.length ? aNorm : bNorm;
    return shorter.length / longer.length;
  }

  // Jaccard similarity on 2-grams
  const ngramSize = 2;
  const getNgrams = (s: string): Set<string> => {
    const ngrams = new Set<string>();
    for (let i = 0; i <= s.length - ngramSize; i++) {
      ngrams.add(s.slice(i, i + ngramSize));
    }
    return ngrams;
  };

  const aGrams = getNgrams(aNorm);
  const bGrams = getNgrams(bNorm);

  if (aGrams.size === 0 || bGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection++;
  }

  const union = aGrams.size + bGrams.size - intersection;
  return intersection / union;
}

/**
 * Serializes requests through a queue to prevent concurrent bursts.
 */
async function rateLimit(): Promise<void> {
  const myTurn = requestQueue.then(() => new Promise<void>(resolve => setTimeout(resolve, REQUEST_DELAY_MS)));
  requestQueue = myTurn.catch(() => { /* ignore */ });
  await myTurn;
}

/**
 * Creates the search payload for HLTB API
 */
function createSearchPayload(gameName: string) {
  return {
    searchType: 'games',
    searchTerms: [gameName],
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: null, max: null },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: ''
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0
    },
    useCache: true
  };
}

/**
 * Converts seconds to hours
 */
function secondsToHours(seconds: number): number {
  if (!seconds || seconds <= 0) return 0;
  return Math.round(seconds / 3600 * 10) / 10;
}

/**
 * Fetches auth token from HLTB API
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const response = await fetch(`${HLTB_BASE_URL}/api/search/init?t=${Date.now()}`);
    if (!response.ok) {
      if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Auth token request failed: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data.token || null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Auth token error:`, errorMessage);
    return null;
  }
}

/**
 * Searches HLTB for a game directly via fetch
 */
async function searchHltb(gameName: string, steamAppId?: string): Promise<HltbSearchResult | null> {
  // Ensure header rules are registered
  await registerHeaderRules();

  if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Searching for: ${gameName}`);

  const authToken = await getAuthToken();
  if (!authToken) {
    if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Failed to get auth token`);
    return null;
  }

  try {
    const response = await fetch(`${HLTB_BASE_URL}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': authToken
      },
      body: JSON.stringify(createSearchPayload(gameName))
    });

    if (!response.ok) {
      if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Search failed with status ${response.status}`);
      return null;
    }

    const result = await response.json();
    if (!result.data || result.data.length === 0) {
      if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} No results for: ${gameName}`);
      return null;
    }

    if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Got ${result.data.length} results, first: ${result.data[0].game_name}`);

    // Check for exact Steam ID match first
    if (steamAppId) {
      const steamIdNum = parseInt(steamAppId, 10);
      const exactMatch = result.data.find((g: { profile_steam: number }) => g.profile_steam === steamIdNum);
      if (exactMatch) {
        if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Exact Steam ID match: ${exactMatch.game_name}`);
        return {
          hltbId: exactMatch.game_id,
          gameName: exactMatch.game_name,
          similarity: 1,
          data: {
            hltbId: exactMatch.game_id,
            mainStory: secondsToHours(exactMatch.comp_main),
            mainExtra: secondsToHours(exactMatch.comp_plus),
            completionist: secondsToHours(exactMatch.comp_100),
            allStyles: secondsToHours(exactMatch.comp_all),
            steamId: exactMatch.profile_steam > 0 ? exactMatch.profile_steam : null
          }
        };
      }
    }

    // Fuzzy match
    interface GameData {
      game_id: number;
      game_name: string;
      comp_main: number;
      comp_plus: number;
      comp_100: number;
      comp_all: number;
      profile_steam: number;
    }
    const candidates = result.data.map((g: GameData) => ({
      similarity: calculateSimilarity(gameName, g.game_name),
      result: {
        hltbId: g.game_id,
        gameName: g.game_name,
        similarity: 0, // Will be set below
        data: {
          hltbId: g.game_id,
          mainStory: secondsToHours(g.comp_main),
          mainExtra: secondsToHours(g.comp_plus),
          completionist: secondsToHours(g.comp_100),
          allStyles: secondsToHours(g.comp_all),
          steamId: g.profile_steam > 0 ? g.profile_steam : null
        }
      }
    }));

    candidates.sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity);
    const best = candidates[0];

    if (best.similarity < 0.5) {
      if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Best match "${best.result.gameName}" too dissimilar (${(best.similarity * 100).toFixed(0)}%)`);
      return null;
    }

    best.result.similarity = best.similarity;
    if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Best match: ${best.result.gameName} (${(best.similarity * 100).toFixed(0)}%), mainStory=${best.result.data.mainStory}h`);
    return best.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${HLTB_LOG_PREFIX} Search error:`, errorMessage);
    return null;
  }
}

/**
 * Queries HLTB for game completion time by game name.
 *
 * @param gameName - The game name to search for (from Steam)
 * @param steamAppId - Optional Steam app ID for exact matching
 * @returns HltbSearchResult if found with confidence, null otherwise
 */
async function queryByGameName(gameName: string, steamAppId?: string): Promise<HltbSearchResult | null> {
  if (HLTB_DEBUG) console.log(`${HLTB_LOG_PREFIX} Searching for: ${gameName} (Steam: ${steamAppId || 'none'})`);

  await rateLimit();

  return searchHltb(gameName, steamAppId);
}

/**
 * Batch queries HLTB for multiple games.
 * Note: HLTB API doesn't support batch queries, so this runs sequentially with rate limiting.
 */
async function batchQueryByGameNames(
  games: Array<{ appid: string; gameName: string }>
): Promise<Map<string, HltbSearchResult | null>> {
  const results = new Map<string, HltbSearchResult | null>();

  for (const { appid, gameName } of games) {
    try {
      const result = await queryByGameName(gameName, appid);
      results.set(appid, result);
    } catch {
      results.set(appid, null);
    }
  }

  return results;
}

// Export for service worker
globalThis.SCPW_HltbClient = {
  queryByGameName,
  batchQueryByGameNames,
  formatHours,
  normalizeGameName,
  calculateSimilarity,
  registerHeaderRules
};

// Also export for module imports in tests
export {
  queryByGameName,
  batchQueryByGameNames,
  formatHours,
  normalizeGameName,
  calculateSimilarity,
  registerHeaderRules
};
