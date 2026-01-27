/**
 * Tests for reviewScoresClient.js
 */

// Load the review scores client
require('../../dist/reviewScoresClient.js');

/**
 * Creates a mock fetch for OpenCritic API
 * @param {Object} options - Options for mock behavior
 */
function createOpenCriticFetchMock(options = {}) {
  const {
    searchResults = [],
    gameDetails = null,
    gameReviews = [],
    searchStatus = 200,
    detailsStatus = 200,
    reviewsStatus = 200,
    scrapeSearchResults = [],
    scrapeGameDetails = null,
    scrapeSearchStatus = 200,
    scrapeDetailsStatus = 200,
    scrapeSearchHtml = null,
    scrapeGameHtml = null
  } = options;

  // Mock headers object
  const mockHeaders = {
    get: () => 'application/json'
  };
  const mockHtmlHeaders = {
    get: () => 'text/html'
  };

  const slugify = (name) => name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return jest.fn().mockImplementation((url) => {
    // Search endpoint
    if (url.includes('/api/game/search')) {
      if (searchStatus !== 200) {
        return Promise.resolve({ ok: false, status: searchStatus, headers: mockHeaders });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: () => Promise.resolve(searchResults)
      });
    }
    // Game reviews endpoint (must come before game details to match correctly)
    if (url.match(/\/api\/review\/game\/\d+$/)) {
      if (reviewsStatus !== 200) {
        return Promise.resolve({ ok: false, status: reviewsStatus, headers: mockHeaders });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: () => Promise.resolve(gameReviews)
      });
    }
    // Game details endpoint
    if (url.match(/\/api\/game\/\d+$/)) {
      if (detailsStatus !== 200) {
        return Promise.resolve({ ok: false, status: detailsStatus, headers: mockHeaders });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: () => Promise.resolve(gameDetails)
      });
    }
    // OpenCritic browse page scrape fallback
    if (url.includes('opencritic.com/browse/all')) {
      if (scrapeSearchStatus !== 200) {
        return Promise.resolve({ ok: false, status: scrapeSearchStatus, headers: mockHtmlHeaders });
      }

      const linksHtml = scrapeSearchResults
        .map(({ id, name, slug }) => `<a href="/game/${id}/${slug || slugify(name)}">${name}</a>`)
        .join('');
      const html = scrapeSearchHtml ?? `<html><body>${linksHtml}</body></html>`;

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: mockHtmlHeaders,
        text: () => Promise.resolve(html)
      });
    }
    // OpenCritic game page scrape fallback
    if (url.includes('opencritic.com/game/')) {
      if (scrapeDetailsStatus !== 200) {
        return Promise.resolve({ ok: false, status: scrapeDetailsStatus, headers: mockHtmlHeaders });
      }

      const nextDataHtml = scrapeGameDetails
        ? `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { game: scrapeGameDetails } } })}</script>`
        : '';
      const html = scrapeGameHtml ?? `<html><body>${nextDataHtml}</body></html>`;

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: mockHtmlHeaders,
        text: () => Promise.resolve(html)
      });
    }
    // Unknown endpoint
    return Promise.resolve({ ok: false, status: 404, headers: mockHeaders });
  });
}

describe('reviewScoresClient.js', () => {
  let ReviewScoresClient;
  let originalFetch;

  beforeAll(() => {
    ReviewScoresClient = globalThis.SCPW_ReviewScoresClient;
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('exports', () => {
    it('should export SCPW_ReviewScoresClient to globalThis', () => {
      expect(globalThis.SCPW_ReviewScoresClient).toBeDefined();
    });

    it('should export all required functions', () => {
      expect(ReviewScoresClient.queryByGameName).toBeInstanceOf(Function);
      expect(ReviewScoresClient.batchQueryByGameNames).toBeInstanceOf(Function);
      expect(ReviewScoresClient.normalizeGameName).toBeInstanceOf(Function);
      expect(ReviewScoresClient.calculateSimilarity).toBeInstanceOf(Function);
      expect(ReviewScoresClient.formatScore).toBeInstanceOf(Function);
      expect(ReviewScoresClient.getTierColor).toBeInstanceOf(Function);
    });
  });

  describe('formatScore', () => {
    it.each([
      [0, ''],
      [-5, ''],
      [null, ''],
      [undefined, ''],
      [85, '85'],
      [92.4, '92'],
      [77.9, '78'],
      [100, '100'],
      [50.5, '51']
    ])('formatScore(%s) should return %s', (input, expected) => {
      expect(ReviewScoresClient.formatScore(input)).toBe(expected);
    });
  });

  describe('getTierColor', () => {
    it('should return green for Mighty', () => {
      expect(ReviewScoresClient.getTierColor('Mighty')).toBe('#66cc33');
    });

    it('should return yellow-green for Strong', () => {
      expect(ReviewScoresClient.getTierColor('Strong')).toBe('#99cc33');
    });

    it('should return yellow for Fair', () => {
      expect(ReviewScoresClient.getTierColor('Fair')).toBe('#ffcc33');
    });

    it('should return orange-red for Weak', () => {
      expect(ReviewScoresClient.getTierColor('Weak')).toBe('#ff6633');
    });

    it('should return gray for Unknown', () => {
      expect(ReviewScoresClient.getTierColor('Unknown')).toBe('#888888');
    });

    it('should return gray for invalid tier', () => {
      expect(ReviewScoresClient.getTierColor('InvalidTier')).toBe('#888888');
    });
  });

  describe('normalizeGameName', () => {
    it('should convert to lowercase', () => {
      expect(ReviewScoresClient.normalizeGameName('HOLLOW KNIGHT')).toBe('hollowknight');
    });

    it('should remove special characters', () => {
      expect(ReviewScoresClient.normalizeGameName('Elden Ring: Shadow of the Erdtree')).toBe('eldenringshadowoftheerdtree');
    });

    it('should remove spaces and punctuation', () => {
      expect(ReviewScoresClient.normalizeGameName('The Witcher 3: Wild Hunt')).toBe('thewitcher3wildhunt');
    });

    it('should handle empty string', () => {
      expect(ReviewScoresClient.normalizeGameName('')).toBe('');
    });
  });

  describe('slugifyGameName', () => {
    it('should convert to lowercase and replace spaces with hyphens', () => {
      expect(ReviewScoresClient.slugifyGameName('Elden Ring')).toBe('elden-ring');
    });

    it('should remove special characters but keep hyphens', () => {
      expect(ReviewScoresClient.slugifyGameName('The Witcher 3: Wild Hunt')).toBe('the-witcher-3-wild-hunt');
    });

    it('should collapse multiple spaces into single hyphen', () => {
      expect(ReviewScoresClient.slugifyGameName('Hollow   Knight')).toBe('hollow-knight');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(ReviewScoresClient.slugifyGameName(' - Test Game - ')).toBe('test-game');
    });

    it('should handle empty string', () => {
      expect(ReviewScoresClient.slugifyGameName('')).toBe('');
    });

    it('should handle complex game names', () => {
      expect(ReviewScoresClient.slugifyGameName("Baldur's Gate 3")).toBe('baldurs-gate-3');
    });
  });

  describe('buildOpenCriticUrl', () => {
    it('should construct valid OpenCritic URL with slug', () => {
      expect(ReviewScoresClient.buildOpenCriticUrl(14607, 'Elden Ring'))
        .toBe('https://opencritic.com/game/14607/elden-ring');
    });

    it('should handle complex game names', () => {
      expect(ReviewScoresClient.buildOpenCriticUrl(12607, "Baldur's Gate 3"))
        .toBe('https://opencritic.com/game/12607/baldurs-gate-3');
    });

    it('should handle game names with colons', () => {
      expect(ReviewScoresClient.buildOpenCriticUrl(123, 'The Witcher 3: Wild Hunt'))
        .toBe('https://opencritic.com/game/123/the-witcher-3-wild-hunt');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(ReviewScoresClient.calculateSimilarity('Hollow Knight', 'hollow knight')).toBe(1);
    });

    it('should return 1 for identical normalized strings', () => {
      expect(ReviewScoresClient.calculateSimilarity('Elden Ring', 'ELDEN RING')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      expect(ReviewScoresClient.calculateSimilarity('abc', 'xyz')).toBe(0);
    });

    it('should return 0 for empty strings when comparing to non-empty', () => {
      expect(ReviewScoresClient.calculateSimilarity('', 'test')).toBe(0);
      expect(ReviewScoresClient.calculateSimilarity('test', '')).toBe(0);
    });

    it('should return 1 for both empty strings (identical)', () => {
      expect(ReviewScoresClient.calculateSimilarity('', '')).toBe(1);
    });

    it('should return high similarity for substring matches', () => {
      const similarity = ReviewScoresClient.calculateSimilarity('Hollow', 'Hollow Knight');
      expect(similarity).toBeGreaterThanOrEqual(0.5);
    });

    it('should return positive similarity for similar strings', () => {
      const similarity = ReviewScoresClient.calculateSimilarity('Baldurs Gate 3', 'Baldurs Gate III');
      expect(similarity).toBeGreaterThan(0);
    });

    it('should return 0 for single character strings (no n-grams possible)', () => {
      expect(ReviewScoresClient.calculateSimilarity('a', 'b')).toBe(0);
    });

    it('should calculate containment similarity when one string contains the other', () => {
      const similarity = ReviewScoresClient.calculateSimilarity('test', 'testing');
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('queryByGameName', () => {
    it('should return null when search returns empty results', async () => {
      globalThis.fetch = createOpenCriticFetchMock({ searchResults: [] });
      const result = await ReviewScoresClient.queryByGameName('Nonexistent Game');
      expect(result).toBeNull();
    }, 15000);

    it('should return null when search fails', async () => {
      globalThis.fetch = createOpenCriticFetchMock({ searchStatus: 500 });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).toBeNull();
    }, 15000);

    it('should return null when best match is below similarity threshold', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Completely Different Name' }],
        gameDetails: { id: 123, name: 'Completely Different Name', topCriticScore: 85, tier: 'Strong', numTopCriticReviews: 50 }
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game XYZ');
      expect(result).toBeNull();
    }, 15000);

    it('should return null when game details have no score', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Hollow Knight' }],
        gameDetails: { id: 123, name: 'Hollow Knight', topCriticScore: 0, tier: 'Unknown', numTopCriticReviews: 0 }
      });
      const result = await ReviewScoresClient.queryByGameName('Hollow Knight');
      expect(result).toBeNull();
    }, 15000);

    it('should return null when game details request fails', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Hollow Knight' }],
        detailsStatus: 404
      });
      const result = await ReviewScoresClient.queryByGameName('Hollow Knight');
      expect(result).toBeNull();
    }, 15000);

    it('should return result when game is found with good match', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 7015, name: 'Hollow Knight' }],
        gameDetails: {
          id: 7015,
          name: 'Hollow Knight',
          topCriticScore: 90,
          tier: 'Mighty',
          numTopCriticReviews: 75,
          percentRecommended: 95
        }
      });
      const result = await ReviewScoresClient.queryByGameName('Hollow Knight');
      expect(result).not.toBeNull();
      expect(result.openCriticId).toBe(7015);
      expect(result.gameName).toBe('Hollow Knight');
      expect(result.data.score).toBe(90);
      expect(result.data.tier).toBe('Mighty');
      expect(result.data.numReviews).toBe(75);
      expect(result.data.percentRecommended).toBe(95);
    }, 15000);

    it('should handle fetch throwing an error', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).toBeNull();
    }, 15000);

    it('should parse tier string correctly for mighty', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: { id: 123, name: 'Test Game', topCriticScore: 85, tier: 'mighty', numTopCriticReviews: 50 }
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result.data.tier).toBe('Mighty');
    }, 15000);

    it('should parse tier string correctly for strong', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: { id: 123, name: 'Test Game', topCriticScore: 85, tier: 'strong', numTopCriticReviews: 50 }
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result.data.tier).toBe('Strong');
    }, 15000);

    it('should parse tier string correctly for fair', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: { id: 123, name: 'Test Game', topCriticScore: 85, tier: 'fair', numTopCriticReviews: 50 }
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result.data.tier).toBe('Fair');
    }, 15000);

    it('should parse tier string correctly for weak', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: { id: 123, name: 'Test Game', topCriticScore: 85, tier: 'weak', numTopCriticReviews: 50 }
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result.data.tier).toBe('Weak');
    }, 15000);

    it('should parse null tier as Unknown', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: { id: 123, name: 'Test Game', topCriticScore: 85, tier: null, numTopCriticReviews: 50 }
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result.data.tier).toBe('Unknown');
    }, 15000);

    it('should parse empty tier as Unknown', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: { id: 123, name: 'Test Game', topCriticScore: 85, tier: '', numTopCriticReviews: 50 }
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result.data.tier).toBe('Unknown');
    }, 15000);

    it('should select best match from multiple search results', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [
          { id: 1, name: 'Hollow Knight Silksong' },
          { id: 2, name: 'Hollow Knight' },
          { id: 3, name: 'Knight Hollow' }
        ],
        gameDetails: {
          id: 2,
          name: 'Hollow Knight',
          topCriticScore: 90,
          tier: 'Mighty',
          numTopCriticReviews: 75
        }
      });
      const result = await ReviewScoresClient.queryByGameName('Hollow Knight');
      expect(result).not.toBeNull();
      expect(result.openCriticId).toBe(2);
    }, 15000);

    it('should handle missing percentRecommended gracefully', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        }
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.percentRecommended).toBe(0);
    }, 15000);

    it('should handle non-array search response', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: 'not an array' })
      });
      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).toBeNull();
    }, 15000);
  });

  describe('direct OpenCritic ID queries', () => {
    it('should use direct ID query when openCriticId is provided', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        // Search endpoint will fail (simulating API auth requirement)
        searchStatus: 400,
        // But direct game endpoint works
        gameDetails: {
          id: 7015,
          name: 'Hollow Knight',
          topCriticScore: 90,
          tier: 'Mighty',
          numTopCriticReviews: 75,
          percentRecommended: 95
        }
      });

      const games = [{ appid: '367520', gameName: 'Hollow Knight', openCriticId: '7015' }];
      const { results, failureReasons } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results.get('367520')).not.toBeNull();
      expect(results.get('367520').openCriticId).toBe(7015);
      expect(results.get('367520').data.score).toBe(90);
      expect(results.get('367520').data.tier).toBe('Mighty');
    }, 15000);

    it('should fall back to search when openCriticId is not provided', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchStatus: 400
      });

      const games = [{ appid: '123', gameName: 'Test Game' }];
      const { results, failureReasons } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results.get('123')).toBeNull();
      expect(failureReasons['123']).toMatch(/search_error/);
    }, 15000);

    it('should handle invalid openCriticId gracefully', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        }
      });

      const games = [{ appid: '123', gameName: 'Test Game', openCriticId: 'invalid' }];
      const { results } = await ReviewScoresClient.batchQueryByGameNames(games);
      // Falls back to search with invalid ID
      expect(results.get('123')).not.toBeNull();
    }, 15000);

    it('should handle null openCriticId', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        }
      });

      const games = [{ appid: '123', gameName: 'Test Game', openCriticId: null }];
      const { results } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results.get('123')).not.toBeNull();
    }, 15000);

    it('should return null when direct ID query finds no score', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        gameDetails: {
          id: 7015,
          name: 'Hollow Knight',
          topCriticScore: 0, // No score
          tier: 'Unknown',
          numTopCriticReviews: 0
        }
      });

      const games = [{ appid: '367520', gameName: 'Hollow Knight', openCriticId: '7015' }];
      const { results, failureReasons } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results.get('367520')).toBeNull();
      expect(failureReasons['367520']).toMatch(/no_score_data/);
    }, 15000);

    it('should return null when direct ID query fails to fetch details', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        detailsStatus: 404
      });

      const games = [{ appid: '367520', gameName: 'Hollow Knight', openCriticId: '7015' }];
      const { results, failureReasons } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results.get('367520')).toBeNull();
      expect(failureReasons['367520']).toMatch(/details_fetch_failed/);
    }, 15000);

    it('should set similarity to 1.0 for direct ID queries', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        gameDetails: {
          id: 7015,
          name: 'Hollow Knight',
          topCriticScore: 90,
          tier: 'Mighty',
          numTopCriticReviews: 75
        }
      });

      const games = [{ appid: '367520', gameName: 'Hollow Knight', openCriticId: '7015' }];
      const { results } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results.get('367520').similarity).toBe(1.0);
    }, 15000);
  });

  describe('batchQueryByGameNames', () => {
    it('should return empty map for empty games array', async () => {
      const { results, failureReasons } = await ReviewScoresClient.batchQueryByGameNames([]);
      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(0);
      expect(failureReasons).toEqual({});
    });

    it('should return results for multiple games', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        }
      });

      const games = [
        { appid: '123', gameName: 'Test Game' },
        { appid: '456', gameName: 'Test Game' }
      ];

      const { results, failureReasons } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
    }, 30000);

    it('should handle null results for games not found', async () => {
      globalThis.fetch = createOpenCriticFetchMock({ searchResults: [] });
      const games = [{ appid: '999', gameName: 'Nonexistent Game' }];
      const { results, failureReasons } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results.get('999')).toBeNull();
      expect(failureReasons['999']).toBe('no_search_results');
    }, 15000);

    it('should catch and return null for individual game errors', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const games = [{ appid: '123', gameName: 'Test Game' }];
      const { results, failureReasons } = await ReviewScoresClient.batchQueryByGameNames(games);
      expect(results.get('123')).toBeNull();
      // Failure could be in searchOpenCritic (search_error) or batchQuery (exception)
      expect(failureReasons['123']).toMatch(/Exception|exception|search_error/);
    }, 15000);
  });

  describe('rate limiting', () => {
    it('should apply rate limiting between requests', async () => {
      const fetchSpy = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: { id: 123, name: 'Test Game', topCriticScore: 85, tier: 'Strong', numTopCriticReviews: 50 }
      });
      globalThis.fetch = fetchSpy;

      // Start two queries
      await Promise.all([
        ReviewScoresClient.queryByGameName('Test Game 1'),
        ReviewScoresClient.queryByGameName('Test Game 2')
      ]);

      // Both queries should have been made (rate limiting doesn't prevent, just delays)
      expect(fetchSpy).toHaveBeenCalled();
    }, 30000);
  });

  describe('outlet scores', () => {
    it('should include outlet scores when reviews are available', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        },
        gameReviews: [
          { id: 1, score: 85, npScore: 85, Outlet: { id: 1, name: 'IGN' }, ScoreFormat: { base: 10 }, externalUrl: 'https://ign.com/review' },
          { id: 2, score: 80, npScore: 80, Outlet: { id: 2, name: 'GameSpot' }, ScoreFormat: { base: 10 } }
        ]
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores).toBeDefined();
      expect(result.data.outletScores.ign).toBeDefined();
      expect(result.data.outletScores.ign.score).toBe(85);
      expect(result.data.outletScores.ign.scaleBase).toBe(10);
      expect(result.data.outletScores.ign.reviewUrl).toBe('https://ign.com/review');
      expect(result.data.outletScores.gamespot).toBeDefined();
      expect(result.data.outletScores.gamespot.score).toBe(80);
    }, 15000);

    it('should handle reviews with no Outlet', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        },
        gameReviews: [
          { id: 1, score: 85, npScore: 85 }, // No Outlet
          { id: 2, score: 80, Outlet: { id: 2 } } // No name
        ]
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores).toBeUndefined();
    }, 15000);

    it('should handle reviews fetch error gracefully', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        },
        reviewsStatus: 500
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores).toBeUndefined();
    }, 15000);

    it('should skip reviews with invalid scores', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        },
        gameReviews: [
          { id: 1, score: 0, npScore: 0, Outlet: { id: 1, name: 'IGN' } }, // Zero score
          { id: 2, score: -5, Outlet: { id: 2, name: 'GameSpot' } } // Negative score
        ]
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores).toBeUndefined();
    }, 15000);

    it('should skip unknown outlet names', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        },
        gameReviews: [
          { id: 1, score: 85, npScore: 85, Outlet: { id: 1, name: 'PC Gamer' } },
          { id: 2, score: 80, npScore: 80, Outlet: { id: 2, name: 'Polygon' } }
        ]
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores).toBeUndefined();
    }, 15000);

    it('should use first review when outlet has multiple reviews', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        },
        gameReviews: [
          { id: 1, score: 85, npScore: 85, Outlet: { id: 1, name: 'IGN' } },
          { id: 2, score: 90, npScore: 90, Outlet: { id: 1, name: 'IGN' } } // Second IGN review
        ]
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores.ign.score).toBe(85); // First one wins
    }, 15000);

    it('should use raw score when npScore is not available', async () => {
      globalThis.fetch = createOpenCriticFetchMock({
        searchResults: [{ id: 123, name: 'Test Game' }],
        gameDetails: {
          id: 123,
          name: 'Test Game',
          topCriticScore: 85,
          tier: 'Strong',
          numTopCriticReviews: 50
        },
        gameReviews: [
          { id: 1, score: 85, Outlet: { id: 1, name: 'IGN' } } // No npScore
        ]
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores.ign.score).toBe(85);
    }, 15000);

    it('should handle non-array reviews response', async () => {
      globalThis.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes('/api/game/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 123, name: 'Test Game' }])
          });
        }
        if (url.match(/\/api\/review\/game\/\d+$/)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ error: 'not an array' }) // Non-array
          });
        }
        if (url.match(/\/api\/game\/\d+$/)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 123,
              name: 'Test Game',
              topCriticScore: 85,
              tier: 'Strong',
              numTopCriticReviews: 50
            })
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores).toBeUndefined();
    }, 15000);

    it('should handle reviews fetch throwing error', async () => {
      let callCount = 0;
      globalThis.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes('/api/game/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 123, name: 'Test Game' }])
          });
        }
        if (url.match(/\/api\/review\/game\/\d+$/)) {
          return Promise.reject(new Error('Network error'));
        }
        if (url.match(/\/api\/game\/\d+$/)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 123,
              name: 'Test Game',
              topCriticScore: 85,
              tier: 'Strong',
              numTopCriticReviews: 50
            })
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await ReviewScoresClient.queryByGameName('Test Game');
      expect(result).not.toBeNull();
      expect(result.data.outletScores).toBeUndefined();
    }, 15000);
  });
});
