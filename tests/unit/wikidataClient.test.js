/**
 * Unit tests for wikidataClient.js
 */

describe('wikidataClient.js', () => {
  let mockFetch;

  beforeEach(() => {
    jest.resetModules();

    // Mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Load the module
    require('../../src/wikidataClient.js');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('exports', () => {
    it('should export XCPW_WikidataClient to globalThis', () => {
      expect(globalThis.XCPW_WikidataClient).toBeDefined();
      expect(typeof globalThis.XCPW_WikidataClient).toBe('object');
    });

    it('should export all required functions', () => {
      const Client = globalThis.XCPW_WikidataClient;
      expect(typeof Client.queryBySteamAppId).toBe('function');
      expect(typeof Client.batchQueryBySteamAppIds).toBe('function');
      expect(typeof Client.getStoreUrl).toBe('function');
      expect(typeof Client.testConnection).toBe('function');
    });

    it('should export STORE_URL_BUILDERS', () => {
      const Client = globalThis.XCPW_WikidataClient;
      expect(Client.STORE_URL_BUILDERS).toBeDefined();
      expect(typeof Client.STORE_URL_BUILDERS).toBe('object');
    });

    it('should export PLATFORM_QIDS', () => {
      const Client = globalThis.XCPW_WikidataClient;
      expect(Client.PLATFORM_QIDS).toBeDefined();
      expect(typeof Client.PLATFORM_QIDS).toBe('object');
    });
  });

  describe('STORE_URL_BUILDERS', () => {
    it('should have builders for all supported stores', () => {
      const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
      expect(typeof builders.nintendo).toBe('function');
      expect(typeof builders.playstation).toBe('function');
      expect(typeof builders.xbox).toBe('function');
      expect(typeof builders.gog).toBe('function');
      expect(typeof builders.epic).toBe('function');
      expect(typeof builders.appStore).toBe('function');
      expect(typeof builders.playStore).toBe('function');
      expect(typeof builders.itch).toBe('function');
    });

    describe('nintendo URL builder', () => {
      it('should build correct Nintendo eShop URL', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        const url = builders.nintendo('hollow-knight');
        expect(url).toBe('https://www.nintendo.com/store/products/hollow-knight/');
      });

      it('should return null for null/undefined ID', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.nintendo(null)).toBeNull();
        expect(builders.nintendo(undefined)).toBeNull();
        expect(builders.nintendo('')).toBeNull();
      });
    });

    describe('playstation URL builder', () => {
      it('should build correct PlayStation Store URL', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        const url = builders.playstation('205366');
        expect(url).toBe('https://store.playstation.com/concept/205366');
      });

      it('should return null for null/undefined ID', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.playstation(null)).toBeNull();
        expect(builders.playstation('')).toBeNull();
      });
    });

    describe('xbox URL builder', () => {
      it('should build correct Xbox Store URL', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        const url = builders.xbox('btd3rn00w2c8');
        expect(url).toBe('https://www.xbox.com/games/store/-/btd3rn00w2c8');
      });

      it('should return null for null/undefined ID', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.xbox(null)).toBeNull();
      });
    });

    describe('other store builders', () => {
      it('should build correct GOG URL', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.gog('hollow_knight')).toBe('https://www.gog.com/game/hollow_knight');
      });

      it('should build correct Epic URL', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.epic('hollow-knight')).toBe('https://store.epicgames.com/p/hollow-knight');
      });

      it('should build correct App Store URL', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.appStore('123456')).toBe('https://apps.apple.com/app/id123456');
      });

      it('should build correct Play Store URL', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.playStore('com.example.game')).toBe('https://play.google.com/store/apps/details?id=com.example.game');
      });

      it('should build correct itch.io URL', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.itch('hollow-knight')).toBe('https://hollow-knight.itch.io/');
      });
    });

    describe('URL format consistency', () => {
      it('should use HTTPS for all URLs', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        expect(builders.nintendo('test')).toMatch(/^https:\/\//);
        expect(builders.playstation('test')).toMatch(/^https:\/\//);
        expect(builders.xbox('test')).toMatch(/^https:\/\//);
        expect(builders.gog('test')).toMatch(/^https:\/\//);
        expect(builders.epic('test')).toMatch(/^https:\/\//);
        expect(builders.appStore('test')).toMatch(/^https:\/\//);
        expect(builders.playStore('test')).toMatch(/^https:\/\//);
        expect(builders.itch('test')).toMatch(/^https:\/\//);
      });

      it('should not include region codes (region-agnostic)', () => {
        const builders = globalThis.XCPW_WikidataClient.STORE_URL_BUILDERS;
        const testId = 'test123';

        // No /us-en/ or similar region paths
        expect(builders.nintendo(testId)).not.toMatch(/\/[a-z]{2}-[a-z]{2}\//i);
        expect(builders.playstation(testId)).not.toMatch(/\/[a-z]{2}-[a-z]{2}\//i);
        expect(builders.xbox(testId)).not.toMatch(/\/[a-z]{2}-[A-Z]{2}\//);
      });
    });
  });

  describe('PLATFORM_QIDS', () => {
    it('should have QID for Nintendo Switch', () => {
      const qids = globalThis.XCPW_WikidataClient.PLATFORM_QIDS;
      expect(qids.SWITCH).toBe('Q19610114');
    });

    it('should have QIDs for PlayStation platforms', () => {
      const qids = globalThis.XCPW_WikidataClient.PLATFORM_QIDS;
      expect(qids.PS4).toBe('Q5014725');
      expect(qids.PS5).toBe('Q63184502');
    });

    it('should have QIDs for Xbox platforms', () => {
      const qids = globalThis.XCPW_WikidataClient.PLATFORM_QIDS;
      expect(qids.XBOX_ONE).toBe('Q13361286');
      expect(qids.XBOX_SERIES_X).toBe('Q64513817');
      expect(qids.XBOX_SERIES_S).toBe('Q98973368');
    });

    it('should have QIDs for PC platforms', () => {
      const qids = globalThis.XCPW_WikidataClient.PLATFORM_QIDS;
      expect(qids.WINDOWS).toBe('Q1406');
      expect(qids.MACOS).toBe('Q14116');
      expect(qids.LINUX).toBe('Q388');
    });
  });

  describe('getStoreUrl', () => {
    it('should return Nintendo URL for nintendo platform', () => {
      const Client = globalThis.XCPW_WikidataClient;
      const storeIds = { eshop: 'hollow-knight', psStore: null, xbox: null };
      const url = Client.getStoreUrl('nintendo', storeIds);
      expect(url).toBe('https://www.nintendo.com/store/products/hollow-knight/');
    });

    it('should return PlayStation URL for playstation platform', () => {
      const Client = globalThis.XCPW_WikidataClient;
      const storeIds = { eshop: null, psStore: '205366', xbox: null };
      const url = Client.getStoreUrl('playstation', storeIds);
      expect(url).toBe('https://store.playstation.com/concept/205366');
    });

    it('should return Xbox URL for xbox platform', () => {
      const Client = globalThis.XCPW_WikidataClient;
      const storeIds = { eshop: null, psStore: null, xbox: 'abc123' };
      const url = Client.getStoreUrl('xbox', storeIds);
      expect(url).toBe('https://www.xbox.com/games/store/-/abc123');
    });

    it('should return null for unknown platform', () => {
      const Client = globalThis.XCPW_WikidataClient;
      const storeIds = { eshop: 'test', psStore: 'test', xbox: 'test' };
      const url = Client.getStoreUrl('unknown_platform', storeIds);
      expect(url).toBeNull();
    });

    it('should return null when store ID is missing', () => {
      const Client = globalThis.XCPW_WikidataClient;
      const storeIds = { eshop: null, psStore: null, xbox: null };
      expect(Client.getStoreUrl('nintendo', storeIds)).toBeNull();
      expect(Client.getStoreUrl('playstation', storeIds)).toBeNull();
      expect(Client.getStoreUrl('xbox', storeIds)).toBeNull();
    });
  });

  describe('queryBySteamAppId', () => {
    beforeEach(() => {
      // Use fake timers for rate limiting tests
      jest.useFakeTimers();
    });

    it('should return not found result when game not in Wikidata', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          results: { bindings: [] }
        })
      });

      const queryPromise = Client.queryBySteamAppId('999999999');

      // Advance timers for rate limiting delay
      await jest.advanceTimersByTimeAsync(600);

      const result = await queryPromise;

      expect(result.found).toBe(false);
      expect(result.wikidataId).toBeNull();
      expect(result.platforms.nintendo).toBe(false);
      expect(result.platforms.playstation).toBe(false);
      expect(result.platforms.xbox).toBe(false);
    });

    it('should parse Wikidata response correctly for game with platforms', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      // Mock response for a game with P400 platforms
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          results: {
            bindings: [{
              game: { value: 'http://www.wikidata.org/entity/Q20056509' },
              gameLabel: { value: 'Hollow Knight' },
              platforms: { value: 'Q19610114,Q5014725,Q63184502,Q13361286' }, // Switch, PS4, PS5, Xbox One
              eshopUs: { value: 'hollow-knight' },
              psStoreConcept: { value: '205366' },
              msStore: { value: 'btd3rn00w2c8' }
            }]
          }
        })
      });

      const queryPromise = Client.queryBySteamAppId('367520');
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result.found).toBe(true);
      expect(result.wikidataId).toBe('Q20056509');
      expect(result.gameName).toBe('Hollow Knight');
      expect(result.platforms.nintendo).toBe(true);
      expect(result.platforms.playstation).toBe(true);
      expect(result.platforms.xbox).toBe(true);
      expect(result.storeIds.eshop).toBe('hollow-knight');
      expect(result.storeIds.psStore).toBe('205366');
      expect(result.storeIds.xbox).toBe('btd3rn00w2c8');
    });

    it('should detect platform from store IDs when P400 is missing', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      // Mock response with store IDs but no P400 platforms
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          results: {
            bindings: [{
              game: { value: 'http://www.wikidata.org/entity/Q12345' },
              gameLabel: { value: 'Test Game' },
              // No platforms field (P400)
              switchTitle: { value: 'switch-title-123' },
              psStoreNa: { value: 'ps-store-123' },
              xbox: { value: 'xbox-123' }
            }]
          }
        })
      });

      const queryPromise = Client.queryBySteamAppId('12345');
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result.found).toBe(true);
      expect(result.platforms.nintendo).toBe(true); // From switchTitle
      expect(result.platforms.playstation).toBe(true); // From psStoreNa
      expect(result.platforms.xbox).toBe(true); // From xbox
    });

    it('should exclude xbox-for-pc from Xbox detection', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      // Mock response with Pure Xbox ID that indicates PC-only
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          results: {
            bindings: [{
              game: { value: 'http://www.wikidata.org/entity/Q12345' },
              gameLabel: { value: 'PC Only Game' },
              pureXbox: { value: 'some-game-xbox-for-pc' } // PC-only indicator
            }]
          }
        })
      });

      const queryPromise = Client.queryBySteamAppId('12345');
      await jest.advanceTimersByTimeAsync(600);
      const result = await queryPromise;

      expect(result.found).toBe(true);
      expect(result.platforms.xbox).toBe(false); // Should NOT detect as Xbox
    });

    it('should throw on network error (transient failure)', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Start the query and advance timers concurrently
      const queryPromise = Client.queryBySteamAppId('12345');

      // Advance timers and wait for promise together
      await expect(
        Promise.all([
          jest.advanceTimersByTimeAsync(600),
          queryPromise
        ])
      ).rejects.toThrow('Wikidata query failed');
    });

    it('should throw on non-200 response (transient failure)', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      // Start the query and advance timers concurrently
      const queryPromise = Client.queryBySteamAppId('12345');

      // Advance timers and wait for promise together
      await expect(
        Promise.all([
          jest.advanceTimersByTimeAsync(600),
          queryPromise
        ])
      ).rejects.toThrow('Wikidata query failed');
    });

    it('should retry on 429 rate limit with backoff', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      // First call: 429
      // Second call: success
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            results: {
              bindings: [{
                game: { value: 'http://www.wikidata.org/entity/Q12345' },
                gameLabel: { value: 'Test Game' }
              }]
            }
          })
        });

      const queryPromise = Client.queryBySteamAppId('12345');

      // First request + rate limit delay
      await jest.advanceTimersByTimeAsync(600);
      // Backoff delay (1000ms)
      await jest.advanceTimersByTimeAsync(1000);
      // Second request + rate limit delay
      await jest.advanceTimersByTimeAsync(600);

      const result = await queryPromise;

      expect(result.found).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries on 429', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      // Always return 429
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429
      });

      const queryPromise = Client.queryBySteamAppId('12345');

      // Total time needed: 500ms initial + (1000 + 500) + (2000 + 500) + (4000 + 500) = 9000ms
      // Advance all at once and wait for promise together
      await expect(
        Promise.all([
          jest.advanceTimersByTimeAsync(10000),
          queryPromise
        ])
      ).rejects.toThrow('Wikidata query failed');

      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should include correct SPARQL query with Steam App ID', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: { bindings: [] } })
      });

      const queryPromise = Client.queryBySteamAppId('367520');
      await jest.advanceTimersByTimeAsync(600);
      await queryPromise;

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('query.wikidata.org'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/sparql-results+json'
          })
        })
      );

      // Check that the query includes the Steam App ID
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('367520');
      expect(callUrl).toContain('P1733'); // Steam App ID property
    });
  });

  describe('batchQueryBySteamAppIds', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should return Map with results for multiple app IDs', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          results: {
            bindings: [
              {
                steamId: { value: '367520' },
                game: { value: 'http://www.wikidata.org/entity/Q20056509' },
                gameLabel: { value: 'Hollow Knight' },
                platforms: { value: 'Q19610114' } // Switch
              },
              {
                steamId: { value: '1245620' },
                game: { value: 'http://www.wikidata.org/entity/Q60743052' },
                gameLabel: { value: 'Elden Ring' },
                platforms: { value: 'Q5014725,Q13361286' } // PS4, Xbox One
              }
            ]
          }
        })
      });

      const appIds = ['367520', '1245620', '999999'];
      const queryPromise = Client.batchQueryBySteamAppIds(appIds);
      await jest.advanceTimersByTimeAsync(600);
      const results = await queryPromise;

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(3);

      // Hollow Knight
      const hollowKnight = results.get('367520');
      expect(hollowKnight.found).toBe(true);
      expect(hollowKnight.gameName).toBe('Hollow Knight');
      expect(hollowKnight.platforms.nintendo).toBe(true);

      // Elden Ring
      const eldenRing = results.get('1245620');
      expect(eldenRing.found).toBe(true);
      expect(eldenRing.platforms.playstation).toBe(true);
      expect(eldenRing.platforms.xbox).toBe(true);

      // Unknown game (should be marked not found)
      const unknown = results.get('999999');
      expect(unknown.found).toBe(false);
    });

    it('should handle empty input array', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      const results = await Client.batchQueryBySteamAppIds([]);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(0);
    });

    it('should batch large arrays in chunks of 20', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      // Create 25 app IDs to test batching
      const appIds = Array.from({ length: 25 }, (_, i) => String(1000 + i));

      // Mock two batch responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: { bindings: [] } })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: { bindings: [] } })
        });

      const queryPromise = Client.batchQueryBySteamAppIds(appIds);

      // First batch
      await jest.advanceTimersByTimeAsync(600);
      // Second batch
      await jest.advanceTimersByTimeAsync(600);

      await queryPromise;

      // Should have made 2 requests (20 + 5)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('testConnection', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should return success when Portal 2 is found', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          results: {
            bindings: [{
              game: { value: 'http://www.wikidata.org/entity/Q8493' },
              gameLabel: { value: 'Portal 2' }
            }]
          }
        })
      });

      const testPromise = Client.testConnection();
      await jest.advanceTimersByTimeAsync(600);
      const result = await testPromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('successful');
    });

    it('should return success even if test game not found', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: { bindings: [] } })
      });

      const testPromise = Client.testConnection();
      await jest.advanceTimersByTimeAsync(600);
      const result = await testPromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('reachable');
    });

    it('should query for Portal 2 (Steam App ID 620)', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: { bindings: [] } })
      });

      const testPromise = Client.testConnection();
      await jest.advanceTimersByTimeAsync(600);
      await testPromise;

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('620');
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should serialize concurrent requests', async () => {
      const Client = globalThis.XCPW_WikidataClient;

      // Track call order
      const callOrder = [];
      mockFetch.mockImplementation(() => {
        callOrder.push(Date.now());
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: { bindings: [] } })
        });
      });

      // Start multiple concurrent requests
      const promise1 = Client.queryBySteamAppId('111');
      const promise2 = Client.queryBySteamAppId('222');
      const promise3 = Client.queryBySteamAppId('333');

      // Advance through all rate limit delays
      await jest.advanceTimersByTimeAsync(600); // First request
      await jest.advanceTimersByTimeAsync(600); // Second request
      await jest.advanceTimersByTimeAsync(600); // Third request

      await Promise.all([promise1, promise2, promise3]);

      // All three requests should have been made
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
