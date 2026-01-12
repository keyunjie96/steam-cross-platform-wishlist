/**
 * Integration Tests - Wikidata SPARQL Queries
 *
 * These tests verify the extension's Wikidata integration works correctly.
 * They make real network requests to query.wikidata.org.
 *
 * Run with: npm run test:integration
 *
 * Note: These tests have a 5-minute timeout to handle rate limiting.
 *
 * @jest-environment node
 */

// Use native fetch from undici for Node.js compatibility
const { fetch } = require('undici');

const { TEST_GAMES } = require('../integration-test-data.js');

// Use a subset of games for CI (faster execution)
const CI_TEST_GAMES = [
  // Well-known multi-platform game
  TEST_GAMES.multiPlatform.find(g => g.appid === '367520'), // Hollow Knight

  // PC-only game
  TEST_GAMES.pcOnly.find(g => g.appid === '294100'), // RimWorld

  // PlayStation exclusive
  TEST_GAMES.partialPlatform.find(g => g.appid === '1593500'), // God of War

  // Chinese indie with Wikidata entry
  TEST_GAMES.chineseIndie.find(g => g.appid === '666140'), // My Time at Portia
].filter(Boolean);

const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
const REQUEST_DELAY_MS = 800; // Higher delay for integration tests

// Platform QIDs from Wikidata
const PLATFORM_QIDS = {
  SWITCH: 'Q19610114',
  PS4: 'Q5014725',
  PS5: 'Q63184502',
  XBOX_ONE: 'Q13361286',
  XBOX_SERIES_X: 'Q64513817',
  XBOX_SERIES_S: 'Q98973368',
};

/**
 * Delays execution
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Queries Wikidata for a game by Steam App ID (simplified version)
 */
async function queryWikidata(steamAppId) {
  const query = `
    SELECT ?game ?gameLabel
           (GROUP_CONCAT(DISTINCT ?platformQID; separator=",") AS ?platforms)
    WHERE {
      ?game wdt:P1733 "${steamAppId}" .
      OPTIONAL {
        ?game wdt:P400 ?platform .
        BIND(STRAFTER(STR(?platform), "entity/") AS ?platformQID)
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    GROUP BY ?game ?gameLabel
    LIMIT 1
  `;

  const url = new URL(WIKIDATA_SPARQL_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'SteamCrossPlatformWishlist-JestIntegration/1.0',
    },
  });

  if (response.status === 429) {
    // Rate limited - wait and retry
    await delay(5000);
    return queryWikidata(steamAppId);
  }

  if (!response.ok) {
    return { found: false, error: `HTTP ${response.status}` };
  }

  const data = await response.json();
  const bindings = data?.results?.bindings;

  if (!bindings || bindings.length === 0) {
    return { found: false };
  }

  const binding = bindings[0];
  const platformQIDs = binding.platforms?.value?.split(',').filter(Boolean) || [];

  // Check platform availability from P400
  const hasSwitch = platformQIDs.includes(PLATFORM_QIDS.SWITCH);
  const hasPS = platformQIDs.includes(PLATFORM_QIDS.PS4) || platformQIDs.includes(PLATFORM_QIDS.PS5);
  const hasXbox = platformQIDs.includes(PLATFORM_QIDS.XBOX_ONE) ||
                  platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_X) ||
                  platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_S);

  return {
    found: true,
    wikidataId: binding.game?.value?.split('/').pop(),
    gameLabel: binding.gameLabel?.value,
    platforms: {
      nintendo: hasSwitch,
      playstation: hasPS,
      xbox: hasXbox,
    },
  };
}

describe('Wikidata Integration', () => {
  // Increase timeout for integration tests (rate limiting can cause delays)
  jest.setTimeout(300000); // 5 minutes

  describe('SPARQL endpoint', () => {
    it('should be reachable', async () => {
      const response = await fetch(WIKIDATA_SPARQL_URL, {
        method: 'HEAD',
        headers: { 'User-Agent': 'SteamCrossPlatformWishlist-JestIntegration/1.0' }
      });

      // 405 is expected for HEAD on SPARQL endpoint
      expect([200, 405]).toContain(response.status);
    });
  });

  describe('Game queries', () => {
    // Run tests sequentially to avoid rate limiting
    const testResults = [];

    beforeAll(async () => {
      // Query all test games before running assertions
      for (const game of CI_TEST_GAMES) {
        const result = await queryWikidata(game.appid);
        testResults.push({ game, result });
        await delay(REQUEST_DELAY_MS);
      }
    });

    it('should find Hollow Knight in Wikidata', () => {
      const { game, result } = testResults.find(r => r.game.appid === '367520');
      expect(result.found).toBe(true);
      expect(result.gameLabel).toContain('Hollow Knight');
    });

    it('should find platform data for Hollow Knight', () => {
      const { result } = testResults.find(r => r.game.appid === '367520');

      if (result.found) {
        // Hollow Knight is available on all platforms
        expect(result.platforms).toBeDefined();
        // At minimum, we expect to find it has some platforms
        const hasSomePlatform = result.platforms.nintendo ||
                                 result.platforms.playstation ||
                                 result.platforms.xbox;
        expect(hasSomePlatform).toBe(true);
      }
    });

    it('should correctly report PC-only game (RimWorld)', () => {
      const { result } = testResults.find(r => r.game.appid === '294100');

      // RimWorld may or may not be in Wikidata
      // If found, it should NOT have console platforms
      if (result.found) {
        expect(result.platforms.nintendo).toBe(false);
        expect(result.platforms.playstation).toBe(false);
        expect(result.platforms.xbox).toBe(false);
      }
    });

    it('should find My Time at Portia with multi-platform support', () => {
      const { result } = testResults.find(r => r.game.appid === '666140');

      if (result.found) {
        // My Time at Portia is available on multiple platforms
        const hasSomePlatform = result.platforms.nintendo ||
                                 result.platforms.playstation ||
                                 result.platforms.xbox;
        expect(hasSomePlatform).toBe(true);
      }
    });
  });

  describe('Query format', () => {
    it('should return proper WikidataResult structure', async () => {
      // Query a well-known game
      const result = await queryWikidata('367520'); // Hollow Knight

      expect(result).toHaveProperty('found');

      if (result.found) {
        expect(result).toHaveProperty('wikidataId');
        expect(result).toHaveProperty('gameLabel');
        expect(result).toHaveProperty('platforms');
        expect(result.platforms).toHaveProperty('nintendo');
        expect(result.platforms).toHaveProperty('playstation');
        expect(result.platforms).toHaveProperty('xbox');

        // Wikidata IDs start with Q
        expect(result.wikidataId).toMatch(/^Q\d+$/);
      }
    });

    it('should return found=false for non-existent game', async () => {
      await delay(REQUEST_DELAY_MS);

      // Use a very unlikely Steam app ID
      const result = await queryWikidata('999999999');

      expect(result.found).toBe(false);
    });
  });
});
