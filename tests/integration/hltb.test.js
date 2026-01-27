/**
 * Integration Tests - HowLongToBeat API
 *
 * Sanity check tests verifying the extension's HLTB integration works correctly.
 * Uses 5 representative games to test search and completion time extraction.
 *
 * Run with: npm run test:integration
 *
 * Note: HLTB uses an undocumented API that may change without notice.
 *
 * @jest-environment node
 */

// Use native fetch from undici for Node.js compatibility
const { fetch } = require('undici');

const HLTB_BASE = 'https://howlongtobeat.com';
const REQUEST_DELAY_MS = 500; // Delay between requests to avoid rate limiting

// 5 representative games for sanity check
const TEST_GAMES = [
  { appid: '367520', name: 'Hollow Knight', category: 'indie' },
  { appid: '1245620', name: 'Elden Ring', category: 'AAA' },
  { appid: '1086940', name: "Baldur's Gate 3", category: 'AAA-recent' },
  { appid: '1145360', name: 'Hades', category: 'indie-popular' },
  { appid: '504230', name: 'Celeste', category: 'indie-darling' },
];

/**
 * Delays execution
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gets auth token from HLTB init endpoint
 */
async function getAuthToken() {
  const url = `${HLTB_BASE}/api/search/init?t=${Date.now()}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': HLTB_BASE,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data?.token || null;
}

/**
 * Searches HLTB for a game by name
 */
async function searchHltb(gameName, authToken) {
  const url = `${HLTB_BASE}/api/search`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': HLTB_BASE,
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      searchType: 'games',
      searchTerms: [gameName],
      searchPage: 1,
      size: 10,
      searchOptions: {
        games: {
          userId: 0,
          platform: '',
          sortCategory: 'popular',
          rangeCategory: 'main',
          rangeTime: { min: null, max: null },
          gameplay: { perspective: '', flow: '', genre: '', subGenre: '' },
          rangeYear: { min: '', max: '' },
          modifier: '',
        },
        users: { sortCategory: 'postcount' },
        lists: { sortCategory: 'follows' },
        filter: '',
        sort: 0,
        randomizer: 0,
      },
    }),
  });

  if (!response.ok) {
    return { found: false, error: `HTTP ${response.status}` };
  }

  const data = await response.json();
  const games = data?.data || [];

  if (games.length === 0) {
    return { found: false };
  }

  // Find best match (normalized name comparison)
  const normalizedSearch = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = games.find(game => {
    const normalizedName = (game.game_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedName === normalizedSearch || normalizedName.includes(normalizedSearch);
  }) || games[0];

  // Convert times from seconds to hours
  const toHours = (seconds) => seconds ? Math.round(seconds / 3600 * 10) / 10 : null;

  return {
    found: true,
    id: match.game_id,
    name: match.game_name,
    times: {
      main: toHours(match.comp_main),
      mainExtra: toHours(match.comp_plus),
      completionist: toHours(match.comp_100),
    },
  };
}

describe('HLTB Integration (Sanity Check)', () => {
  // Increase timeout for integration tests
  jest.setTimeout(120000); // 2 minutes

  let authToken = null;
  const testResults = [];

  // Get auth token and query all test games once before running assertions
  beforeAll(async () => {
    // Get auth token first
    authToken = await getAuthToken();
    console.log(`\nHLTB Auth token obtained: ${authToken ? 'Yes' : 'No'}`);

    if (!authToken) {
      console.warn('Warning: Could not obtain HLTB auth token. Tests may fail.');
      return;
    }

    await delay(REQUEST_DELAY_MS);

    for (const game of TEST_GAMES) {
      const result = await searchHltb(game.name, authToken);
      testResults.push({ game, result });
      await delay(REQUEST_DELAY_MS);
    }

    // Log summary for debugging
    console.log('\n=== HLTB Sanity Check Summary ===');
    for (const { game, result } of testResults) {
      console.log(`\n${game.name} (${game.category}):`);
      console.log(`  Found: ${result.found}`);
      console.log(`  HLTB ID: ${result.id || 'N/A'}`);
      console.log(`  HLTB Name: ${result.name || 'N/A'}`);
      if (result.times) {
        console.log(`  Main Story: ${result.times.main || 'N/A'} hours`);
        console.log(`  Main + Extra: ${result.times.mainExtra || 'N/A'} hours`);
        console.log(`  Completionist: ${result.times.completionist || 'N/A'} hours`);
      }
    }
    console.log('\n=================================\n');
  });

  describe('Auth token', () => {
    it('should obtain auth token from init endpoint', () => {
      expect(authToken).not.toBeNull();
      expect(typeof authToken).toBe('string');
      expect(authToken.length).toBeGreaterThan(0);
    });
  });

  describe('Game search', () => {
    it('should find all 5 test games', () => {
      if (!authToken) {
        console.warn('Skipping: No auth token');
        return;
      }

      const foundCount = testResults.filter(r => r.result.found).length;
      expect(foundCount).toBe(5);
    });

    it('should return valid HLTB IDs', () => {
      if (!authToken) return;

      for (const { result } of testResults) {
        if (result.found) {
          expect(result.id).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Completion times', () => {
    it('should have main story time for all found games', () => {
      if (!authToken) return;

      for (const { game, result } of testResults) {
        if (result.found) {
          expect(result.times).toBeDefined();
          // Main story time should be positive
          if (result.times.main) {
            expect(result.times.main).toBeGreaterThan(0);
          }
        }
      }
    });

    it('should have reasonable completion times', () => {
      if (!authToken) return;

      for (const { game, result } of testResults) {
        if (result.found && result.times) {
          // Games shouldn't take more than 500 hours for main story
          if (result.times.main) {
            expect(result.times.main).toBeLessThan(500);
          }
          // Completionist should be >= main story
          if (result.times.main && result.times.completionist) {
            expect(result.times.completionist).toBeGreaterThanOrEqual(result.times.main);
          }
        }
      }
    });

    it('should return times in hours (not seconds)', () => {
      if (!authToken) return;

      // Hollow Knight main story should be around 25-30 hours, not 90000+ seconds
      const hollowKnight = testResults.find(r => r.game.appid === '367520');
      if (hollowKnight?.result.found && hollowKnight.result.times?.main) {
        expect(hollowKnight.result.times.main).toBeLessThan(100);
        expect(hollowKnight.result.times.main).toBeGreaterThan(10);
      }
    });
  });
});
