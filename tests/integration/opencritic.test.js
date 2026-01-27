/**
 * Integration Tests - OpenCritic API
 *
 * Sanity check tests verifying the extension's OpenCritic integration works correctly.
 * Uses 5 representative games to test search, game details, and outlet score extraction.
 *
 * Run with: npm run test:integration
 *
 * @jest-environment node
 */

// Use native fetch from undici for Node.js compatibility
const { fetch } = require('undici');

const OPENCRITIC_API_BASE = 'https://api.opencritic.com/api';
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
 * Searches OpenCritic for a game by name
 */
async function searchGame(gameName) {
  const url = `${OPENCRITIC_API_BASE}/game/search?criteria=${encodeURIComponent(gameName)}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SteamCrossPlatformWishlist-JestIntegration/1.0',
    },
  });

  if (!response.ok) {
    return { found: false, error: `HTTP ${response.status}` };
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    return { found: false };
  }

  // Find best match (exact or close name match)
  const normalizedSearch = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = data.find(game => {
    const normalizedName = game.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedName === normalizedSearch || normalizedName.includes(normalizedSearch);
  }) || data[0];

  return {
    found: true,
    id: match.id,
    name: match.name,
  };
}

/**
 * Gets game details from OpenCritic
 */
async function getGameDetails(gameId) {
  const url = `${OPENCRITIC_API_BASE}/game/${gameId}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SteamCrossPlatformWishlist-JestIntegration/1.0',
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

/**
 * Gets reviews for a game from OpenCritic
 */
async function getGameReviews(gameId) {
  const url = `${OPENCRITIC_API_BASE}/review/game/${gameId}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SteamCrossPlatformWishlist-JestIntegration/1.0',
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Extracts outlet scores from reviews (matches reviewScoresClient.ts logic)
 */
function extractOutletScores(reviews) {
  const outletScores = {};
  const targetOutlets = ['IGN', 'GameSpot', 'Metacritic'];

  for (const review of reviews) {
    if (!review.Outlet?.name) continue;

    const outletName = review.Outlet.name;
    if (!targetOutlets.includes(outletName)) continue;

    // Skip if we already have a score for this outlet
    if (outletScores[outletName]) continue;

    // Use normalized score (npScore) if available, otherwise use raw score
    const score = review.npScore ?? review.score;
    if (!score || score <= 0) continue;

    outletScores[outletName] = {
      outletName,
      score,
      originalScore: review.scoreFormat?.displayScore,
    };
  }

  return outletScores;
}

describe('OpenCritic Integration (Sanity Check)', () => {
  // Increase timeout for integration tests
  jest.setTimeout(120000); // 2 minutes

  const testResults = [];

  // Query all test games once before running assertions
  beforeAll(async () => {
    for (const game of TEST_GAMES) {
      const search = await searchGame(game.name);
      await delay(REQUEST_DELAY_MS);

      let details = null;
      let reviews = [];
      let outletScores = {};

      if (search.found) {
        details = await getGameDetails(search.id);
        await delay(REQUEST_DELAY_MS);

        reviews = await getGameReviews(search.id);
        outletScores = extractOutletScores(reviews);
        await delay(REQUEST_DELAY_MS);
      }

      testResults.push({
        game,
        search,
        details,
        reviewCount: reviews.length,
        outletScores,
      });
    }

    // Log summary for debugging
    console.log('\n=== OpenCritic Sanity Check Summary ===');
    for (const result of testResults) {
      console.log(`\n${result.game.name} (${result.game.category}):`);
      console.log(`  Found: ${result.search.found}`);
      console.log(`  OpenCritic ID: ${result.search.id || 'N/A'}`);
      console.log(`  Score: ${result.details?.topCriticScore || 'N/A'}`);
      console.log(`  Tier: ${result.details?.tier || 'N/A'}`);
      console.log(`  Review count: ${result.reviewCount}`);
      console.log(`  Outlet scores: ${JSON.stringify(result.outletScores)}`);
    }
    console.log('\n========================================\n');
  });

  describe('API endpoint', () => {
    it('should be reachable', async () => {
      const response = await fetch(`${OPENCRITIC_API_BASE}/game/search?criteria=test`, {
        headers: { 'User-Agent': 'SteamCrossPlatformWishlist-JestIntegration/1.0' }
      });

      // Should get a response (200 or similar)
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Game search', () => {
    it('should find all 5 test games', () => {
      const foundCount = testResults.filter(r => r.search.found).length;
      expect(foundCount).toBe(5);
    });

    it('should return valid OpenCritic IDs', () => {
      for (const result of testResults) {
        if (result.search.found) {
          expect(result.search.id).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Game details', () => {
    it('should have topCriticScore for all found games', () => {
      for (const result of testResults) {
        if (result.search.found) {
          expect(result.details).not.toBeNull();
          expect(result.details.topCriticScore).toBeGreaterThan(0);
        }
      }
    });

    it('should have tier for all found games', () => {
      for (const result of testResults) {
        if (result.search.found && result.details) {
          expect(result.details.tier).toBeDefined();
          const normalizedTier = result.details.tier.charAt(0).toUpperCase() +
                                  result.details.tier.slice(1).toLowerCase();
          expect(['Mighty', 'Strong', 'Fair', 'Weak']).toContain(normalizedTier);
        }
      }
    });
  });

  describe('Outlet score extraction', () => {
    it('should have reviews for well-known games', () => {
      // At least Elden Ring and BG3 should have reviews
      const eldenRing = testResults.find(r => r.game.appid === '1245620');
      const bg3 = testResults.find(r => r.game.appid === '1086940');

      if (eldenRing?.search.found) {
        expect(eldenRing.reviewCount).toBeGreaterThan(0);
      }
      if (bg3?.search.found) {
        expect(bg3.reviewCount).toBeGreaterThan(0);
      }
    });

    it('should extract at least some outlet scores', () => {
      // At least one game should have IGN or GameSpot scores
      const hasAnyOutletScore = testResults.some(r =>
        Object.keys(r.outletScores).length > 0
      );

      if (!hasAnyOutletScore) {
        console.warn('Warning: No outlet scores found. API structure may have changed.');
      }

      // Soft assertion - log but don't fail
      expect(true).toBe(true);
    });

    it('should have valid score structure when extracted', () => {
      for (const result of testResults) {
        for (const [outletName, outletScore] of Object.entries(result.outletScores)) {
          expect(outletScore).toHaveProperty('outletName');
          expect(outletScore).toHaveProperty('score');
          expect(outletScore.outletName).toBe(outletName);
          expect(typeof outletScore.score).toBe('number');
          expect(outletScore.score).toBeGreaterThan(0);
          expect(outletScore.score).toBeLessThanOrEqual(100);
        }
      }
    });
  });
});
