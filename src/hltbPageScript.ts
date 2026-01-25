/**
 * Steam Cross-Platform Wishlist - HLTB Page Script
 *
 * This script runs in the MAIN world on howlongtobeat.com pages.
 * It makes API requests with the correct origin header to bypass CORS restrictions.
 * Communicates with the extension via window.postMessage.
 */

(function() {
  const LOG_PREFIX = '[XCPW HLTB PageScript]';
  const DEBUG = false;

  interface HltbRequest {
    type: 'XCPW_HLTB_REQUEST';
    requestId: string;
    gameName: string;
    steamAppId?: string;
  }

  interface HltbResponse {
    type: 'XCPW_HLTB_RESPONSE';
    requestId: string;
    success: boolean;
    data?: {
      hltbId: number;
      gameName: string;
      mainStory: number;
      mainExtra: number;
      completionist: number;
      allStyles: number;
      steamId: number | null;
    } | null;
    error?: string;
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
   * Normalizes game name for fuzzy matching
   */
  function normalizeGameName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  /**
   * Calculates similarity between two strings
   */
  function calculateSimilarity(a: string, b: string): number {
    const aNorm = normalizeGameName(a);
    const bNorm = normalizeGameName(b);
    if (aNorm === bNorm) return 1;
    if (!aNorm || !bNorm) return 0;
    if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
      const shorter = aNorm.length < bNorm.length ? aNorm : bNorm;
      const longer = aNorm.length >= bNorm.length ? aNorm : bNorm;
      return shorter.length / longer.length;
    }
    // Jaccard similarity on 2-grams
    const getNgrams = (s: string): Set<string> => {
      const ngrams = new Set<string>();
      for (let i = 0; i <= s.length - 2; i++) {
        ngrams.add(s.slice(i, i + 2));
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
    return intersection / (aGrams.size + bGrams.size - intersection);
  }

  /**
   * Fetches auth token from HLTB API
   */
  async function getAuthToken(): Promise<string | null> {
    try {
      const response = await fetch(`/api/search/init?t=${Date.now()}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.token || null;
    } catch {
      return null;
    }
  }

  /**
   * Searches HLTB for a game
   */
  async function searchHltb(gameName: string, steamAppId?: string): Promise<HltbResponse['data']> {
    if (DEBUG) console.log(`${LOG_PREFIX} Searching for: ${gameName}`);

    const authToken = await getAuthToken();
    if (!authToken) {
      if (DEBUG) console.log(`${LOG_PREFIX} Failed to get auth token`);
      return null;
    }

    const response = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-auth-token': authToken
      },
      body: JSON.stringify(createSearchPayload(gameName))
    });

    if (!response.ok) {
      if (DEBUG) console.log(`${LOG_PREFIX} Search failed with status ${response.status}`);
      return null;
    }

    const result = await response.json();
    if (!result.data || result.data.length === 0) {
      if (DEBUG) console.log(`${LOG_PREFIX} No results for: ${gameName}`);
      return null;
    }

    if (DEBUG) console.log(`${LOG_PREFIX} Got ${result.data.length} results, first: ${result.data[0].game_name}`);

    // Check for exact Steam ID match first
    if (steamAppId) {
      const steamIdNum = parseInt(steamAppId, 10);
      const exactMatch = result.data.find((g: { profile_steam: number }) => g.profile_steam === steamIdNum);
      if (exactMatch) {
        if (DEBUG) console.log(`${LOG_PREFIX} Exact Steam ID match: ${exactMatch.game_name}`);
        return {
          hltbId: exactMatch.game_id,
          gameName: exactMatch.game_name,
          mainStory: secondsToHours(exactMatch.comp_main),
          mainExtra: secondsToHours(exactMatch.comp_plus),
          completionist: secondsToHours(exactMatch.comp_100),
          allStyles: secondsToHours(exactMatch.comp_all),
          steamId: exactMatch.profile_steam > 0 ? exactMatch.profile_steam : null
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
      data: {
        hltbId: g.game_id,
        gameName: g.game_name,
        mainStory: secondsToHours(g.comp_main),
        mainExtra: secondsToHours(g.comp_plus),
        completionist: secondsToHours(g.comp_100),
        allStyles: secondsToHours(g.comp_all),
        steamId: g.profile_steam > 0 ? g.profile_steam : null
      }
    }));

    candidates.sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity);
    const best = candidates[0];

    if (best.similarity < 0.5) {
      if (DEBUG) console.log(`${LOG_PREFIX} Best match "${best.data.gameName}" too dissimilar (${(best.similarity * 100).toFixed(0)}%)`);
      return null;
    }

    if (DEBUG) console.log(`${LOG_PREFIX} Best match: ${best.data.gameName} (${(best.similarity * 100).toFixed(0)}%), mainStory=${best.data.mainStory}h`);
    return best.data;
  }

  /**
   * Handles incoming requests from the extension
   */
  async function handleRequest(event: MessageEvent) {
    if (event.source !== window) return;
    const message = event.data as HltbRequest;
    if (message?.type !== 'XCPW_HLTB_REQUEST') return;

    if (DEBUG) console.log(`${LOG_PREFIX} Received request:`, message);

    try {
      const data = await searchHltb(message.gameName, message.steamAppId);
      const response: HltbResponse = {
        type: 'XCPW_HLTB_RESPONSE',
        requestId: message.requestId,
        success: true,
        data
      };
      window.postMessage(response, '*');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const response: HltbResponse = {
        type: 'XCPW_HLTB_RESPONSE',
        requestId: message.requestId,
        success: false,
        error: errorMessage
      };
      window.postMessage(response, '*');
    }
  }

  window.addEventListener('message', handleRequest);
  if (DEBUG) console.log(`${LOG_PREFIX} Page script loaded, listening for requests`);

  // Signal that the script is ready
  window.postMessage({ type: 'XCPW_HLTB_READY' }, '*');
})();
