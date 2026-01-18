/**
 * Unit tests for reviewScoresClient.js
 */

describe('reviewScoresClient.js', () => {
  let mockFetch;
  let mockChrome;

  beforeEach(() => {
    jest.resetModules();

    // Mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Mock chrome.storage.local
    mockChrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn()
        }
      }
    };
    global.chrome = mockChrome;

    // Load the module
    require('../../dist/reviewScoresClient.js');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('exports', () => {
    it('should export XCPW_ReviewScores to globalThis', () => {
      expect(globalThis.XCPW_ReviewScores).toBeDefined();
      expect(typeof globalThis.XCPW_ReviewScores).toBe('object');
    });

    it('should export all required functions', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(typeof Client.resolveReviewScore).toBe('function');
      expect(typeof Client.batchResolveReviewScores).toBe('function');
      expect(typeof Client.queryReviewScore).toBe('function');
      expect(typeof Client.getFromReviewCache).toBe('function');
      expect(typeof Client.saveToReviewCache).toBe('function');
      expect(typeof Client.clearReviewCache).toBe('function');
      expect(typeof Client.getReviewCacheStats).toBe('function');
      expect(typeof Client.isReviewCacheValid).toBe('function');
      expect(typeof Client.calculateSimilarity).toBe('function');
      expect(typeof Client.normalizeGameName).toBe('function');
    });

    it('should export CACHE_KEY_PREFIX', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.CACHE_KEY_PREFIX).toBe('xcpw_review_');
    });
  });

  describe('normalizeGameName', () => {
    it('should convert to lowercase', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.normalizeGameName('Hollow Knight')).toBe('hollow knight');
    });

    it('should remove special characters', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.normalizeGameName("Baldur's Gate 3")).toBe('baldurs gate 3');
    });

    it('should normalize whitespace', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.normalizeGameName('Game   With  Spaces')).toBe('game with spaces');
    });

    it('should handle empty string', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.normalizeGameName('')).toBe('');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.calculateSimilarity('Hollow Knight', 'Hollow Knight')).toBe(1);
    });

    it('should return 1 for case-different strings', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.calculateSimilarity('HOLLOW KNIGHT', 'hollow knight')).toBe(1);
    });

    it('should return high score for containing match', () => {
      const Client = globalThis.XCPW_ReviewScores;
      const score = Client.calculateSimilarity('Hollow Knight', 'Hollow Knight: Silksong');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    it('should return lower score for partial word overlap', () => {
      const Client = globalThis.XCPW_ReviewScores;
      const score = Client.calculateSimilarity('Hollow Knight', 'Dark Souls');
      expect(score).toBeLessThan(0.5);
    });

    it('should handle empty strings', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.calculateSimilarity('', '')).toBe(1);
    });
  });

  describe('isReviewCacheValid', () => {
    it('should return false for null entry', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.isReviewCacheValid(null)).toBe(false);
    });

    it('should return false for undefined entry', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.isReviewCacheValid(undefined)).toBe(false);
    });

    it('should return false for entry without resolvedAt', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.isReviewCacheValid({ ttlDays: 7 })).toBe(false);
    });

    it('should return false for entry without ttlDays', () => {
      const Client = globalThis.XCPW_ReviewScores;
      expect(Client.isReviewCacheValid({ resolvedAt: Date.now() })).toBe(false);
    });

    it('should return true for valid non-expired entry', () => {
      const Client = globalThis.XCPW_ReviewScores;
      const entry = {
        resolvedAt: Date.now(),
        ttlDays: 7
      };
      expect(Client.isReviewCacheValid(entry)).toBe(true);
    });

    it('should return false for expired entry', () => {
      const Client = globalThis.XCPW_ReviewScores;
      const entry = {
        resolvedAt: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
        ttlDays: 7
      };
      expect(Client.isReviewCacheValid(entry)).toBe(false);
    });
  });

  describe('getFromReviewCache', () => {
    it('should return null when cache is empty', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      mockChrome.storage.local.get.mockResolvedValue({});

      const result = await Client.getFromReviewCache('12345');
      expect(result).toBeNull();
    });

    it('should return null for expired cache entry', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      mockChrome.storage.local.get.mockResolvedValue({
        'xcpw_review_12345': {
          resolvedAt: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
          ttlDays: 7
        }
      });

      const result = await Client.getFromReviewCache('12345');
      expect(result).toBeNull();
    });

    it('should return valid cache entry', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      const cachedEntry = {
        appid: '12345',
        gameName: 'Test Game',
        score: { source: 'opencritic', score: 85 },
        resolvedAt: Date.now(),
        ttlDays: 7
      };
      mockChrome.storage.local.get.mockResolvedValue({
        'xcpw_review_12345': cachedEntry
      });

      const result = await Client.getFromReviewCache('12345');
      expect(result).toEqual(cachedEntry);
    });
  });

  describe('saveToReviewCache', () => {
    it('should save entry to chrome.storage.local', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      mockChrome.storage.local.set.mockResolvedValue();

      const entry = {
        appid: '12345',
        gameName: 'Test Game',
        score: { source: 'opencritic', score: 85 },
        resolvedAt: Date.now(),
        ttlDays: 7
      };

      await Client.saveToReviewCache(entry);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        'xcpw_review_12345': entry
      });
    });
  });

  describe('clearReviewCache', () => {
    it('should remove all review cache entries', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      mockChrome.storage.local.get.mockResolvedValue({
        'xcpw_review_111': { appid: '111' },
        'xcpw_review_222': { appid: '222' },
        'xcpw_cache_333': { appid: '333' } // Not a review cache entry
      });
      mockChrome.storage.local.remove.mockResolvedValue();

      await Client.clearReviewCache();

      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        'xcpw_review_111',
        'xcpw_review_222'
      ]);
    });

    it('should handle empty cache gracefully', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      mockChrome.storage.local.get.mockResolvedValue({});

      await Client.clearReviewCache();

      expect(mockChrome.storage.local.remove).not.toHaveBeenCalled();
    });
  });

  describe('getReviewCacheStats', () => {
    it('should return count and oldest entry', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      const oldestTimestamp = Date.now() - 86400000;
      mockChrome.storage.local.get.mockResolvedValue({
        'xcpw_review_111': { resolvedAt: Date.now() },
        'xcpw_review_222': { resolvedAt: oldestTimestamp }
      });

      const stats = await Client.getReviewCacheStats();

      expect(stats.count).toBe(2);
      expect(stats.oldestEntry).toBe(oldestTimestamp);
    });

    it('should handle empty cache', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      mockChrome.storage.local.get.mockResolvedValue({});

      const stats = await Client.getReviewCacheStats();

      expect(stats.count).toBe(0);
      expect(stats.oldestEntry).toBeNull();
    });
  });

  describe('queryReviewScore', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should return null when game not found in search', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([])
      });

      const queryPromise = Client.queryReviewScore('Unknown Game');
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result).toBeNull();
    });

    it('should return null when no good name match is found', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 123, name: 'Completely Different Game', dist: 0.9 }
        ])
      });

      const queryPromise = Client.queryReviewScore('Hollow Knight');
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result).toBeNull();
    });

    it('should return null when game details fetch fails', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      // Search returns a match
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 123, name: 'Hollow Knight', dist: 0 }
        ])
      });

      // Game details fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const queryPromise = Client.queryReviewScore('Hollow Knight');
      await jest.advanceTimersByTimeAsync(600); // First request
      await jest.advanceTimersByTimeAsync(600); // Second request
      const result = await queryPromise;

      expect(result).toBeNull();
    });

    it('should return null when game has no score yet', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      // Search returns a match
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 123, name: 'Upcoming Game', dist: 0 }
        ])
      });

      // Game details with no score
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 123,
          name: 'Upcoming Game',
          topCriticScore: -1 // No score yet
        })
      });

      const queryPromise = Client.queryReviewScore('Upcoming Game');
      await jest.advanceTimersByTimeAsync(600);
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result).toBeNull();
    });

    it('should return score for found game', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      // Search returns a match
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 7686, name: 'Hollow Knight', dist: 0 }
        ])
      });

      // Game details
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 7686,
          name: 'Hollow Knight',
          topCriticScore: 90.5,
          tier: 'Mighty',
          numTopCriticReviews: 150
        })
      });

      const queryPromise = Client.queryReviewScore('Hollow Knight');
      await jest.advanceTimersByTimeAsync(600);
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result).not.toBeNull();
      expect(result.source).toBe('opencritic');
      expect(result.score).toBe(91); // Rounded
      expect(result.tier).toBe('Mighty');
      expect(result.criticCount).toBe(150);
      expect(result.url).toContain('7686');
      expect(result.url).toContain('hollow-knight');
    });

    it('should retry on 429 rate limit', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      // First call: 429
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429
      });

      // Second call: success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 123, name: 'Test Game', dist: 0 }
        ])
      });

      // Game details
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 123,
          name: 'Test Game',
          topCriticScore: 75,
          tier: 'Strong'
        })
      });

      const queryPromise = Client.queryReviewScore('Test Game');

      // First request + rate limit delay
      await jest.advanceTimersByTimeAsync(600);
      // Backoff delay (1000ms)
      await jest.advanceTimersByTimeAsync(1000);
      // Second request + rate limit delay
      await jest.advanceTimersByTimeAsync(600);
      // Third request for details
      await jest.advanceTimersByTimeAsync(600);

      const result = await queryPromise;

      expect(result).not.toBeNull();
      expect(result.score).toBe(75);
    });
  });

  describe('resolveReviewScore', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should return cached data when available', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      const cachedEntry = {
        appid: '12345',
        gameName: 'Hollow Knight',
        score: { source: 'opencritic', score: 90 },
        resolvedAt: Date.now(),
        ttlDays: 7
      };
      mockChrome.storage.local.get.mockResolvedValue({
        'xcpw_review_12345': cachedEntry
      });

      const result = await Client.resolveReviewScore('12345', 'Hollow Knight');

      expect(result.entry).toEqual(cachedEntry);
      expect(result.fromCache).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch and cache new data when not cached', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      mockChrome.storage.local.get.mockResolvedValue({});
      mockChrome.storage.local.set.mockResolvedValue();

      // Search returns a match
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 7686, name: 'Hollow Knight', dist: 0 }
        ])
      });

      // Game details
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 7686,
          name: 'Hollow Knight',
          topCriticScore: 90,
          tier: 'Mighty'
        })
      });

      const resolvePromise = Client.resolveReviewScore('12345', 'Hollow Knight');
      await jest.advanceTimersByTimeAsync(600);
      await jest.advanceTimersByTimeAsync(600);
      const result = await resolvePromise;

      expect(result.fromCache).toBe(false);
      expect(result.entry.score).not.toBeNull();
      expect(result.entry.score.score).toBe(90);
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it('should cache null score when game not found', async () => {
      const Client = globalThis.XCPW_ReviewScores;
      mockChrome.storage.local.get.mockResolvedValue({});
      mockChrome.storage.local.set.mockResolvedValue();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]) // No results
      });

      const resolvePromise = Client.resolveReviewScore('99999', 'Unknown Game');
      await jest.advanceTimersByTimeAsync(600);
      const result = await resolvePromise;

      expect(result.fromCache).toBe(false);
      expect(result.entry.score).toBeNull();
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('batchResolveReviewScores', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should return all cached when all games are cached', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      const cachedEntry1 = {
        appid: '111',
        gameName: 'Game 1',
        score: { source: 'opencritic', score: 85 },
        resolvedAt: Date.now(),
        ttlDays: 7
      };
      const cachedEntry2 = {
        appid: '222',
        gameName: 'Game 2',
        score: { source: 'opencritic', score: 75 },
        resolvedAt: Date.now(),
        ttlDays: 7
      };

      mockChrome.storage.local.get
        .mockResolvedValueOnce({ 'xcpw_review_111': cachedEntry1 })
        .mockResolvedValueOnce({ 'xcpw_review_222': cachedEntry2 });

      const games = [
        { appid: '111', gameName: 'Game 1' },
        { appid: '222', gameName: 'Game 2' }
      ];

      const results = await Client.batchResolveReviewScores(games);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
      expect(results.get('111').fromCache).toBe(true);
      expect(results.get('222').fromCache).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch uncached games', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      // First game is cached
      const cachedEntry = {
        appid: '111',
        gameName: 'Game 1',
        score: { source: 'opencritic', score: 85 },
        resolvedAt: Date.now(),
        ttlDays: 7
      };

      mockChrome.storage.local.get
        .mockResolvedValueOnce({ 'xcpw_review_111': cachedEntry })
        .mockResolvedValueOnce({}) // Second game not cached
        .mockResolvedValueOnce({}); // For resolveReviewScore internal call
      mockChrome.storage.local.set.mockResolvedValue();

      // Search and details for uncached game
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 456, name: 'Game 2', dist: 0 }
        ])
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 456,
          name: 'Game 2',
          topCriticScore: 70
        })
      });

      const games = [
        { appid: '111', gameName: 'Game 1' },
        { appid: '222', gameName: 'Game 2' }
      ];

      const batchPromise = Client.batchResolveReviewScores(games);
      await jest.advanceTimersByTimeAsync(600);
      await jest.advanceTimersByTimeAsync(600);
      const results = await batchPromise;

      expect(results.size).toBe(2);
      expect(results.get('111').fromCache).toBe(true);
      expect(results.get('222').fromCache).toBe(false);
    });

    it('should handle empty input array', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      const results = await Client.batchResolveReviewScores([]);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(0);
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should serialize concurrent requests', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      mockFetch.mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([])
        });
      });

      // Start multiple concurrent requests
      const promise1 = Client.queryReviewScore('Game 1');
      const promise2 = Client.queryReviewScore('Game 2');
      const promise3 = Client.queryReviewScore('Game 3');

      // Advance through all rate limit delays
      await jest.advanceTimersByTimeAsync(600);
      await jest.advanceTimersByTimeAsync(600);
      await jest.advanceTimersByTimeAsync(600);

      await Promise.all([promise1, promise2, promise3]);

      // All three requests should have been made
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('URL generation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should generate correct OpenCritic URL', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 7686, name: 'Hollow Knight', dist: 0 }
        ])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 7686,
          name: 'Hollow Knight',
          topCriticScore: 90
        })
      });

      const queryPromise = Client.queryReviewScore('Hollow Knight');
      await jest.advanceTimersByTimeAsync(600);
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result.url).toBe('https://opencritic.com/game/7686/hollow-knight');
    });

    it('should handle special characters in game name for URL slug', async () => {
      const Client = globalThis.XCPW_ReviewScores;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: 123, name: "Baldur's Gate 3", dist: 0 }
        ])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 123,
          name: "Baldur's Gate 3",
          topCriticScore: 95
        })
      });

      const queryPromise = Client.queryReviewScore("Baldur's Gate 3");
      await jest.advanceTimersByTimeAsync(600);
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result.url).toBe('https://opencritic.com/game/123/baldurs-gate-3');
    });
  });
});
