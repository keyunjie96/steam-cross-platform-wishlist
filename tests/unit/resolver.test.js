/**
 * Unit tests for resolver.js
 */

const { setMockStorageData, getMockStorageData, clearMockStorage } = require('../mocks/chrome');

describe('resolver.js', () => {
  let mockCache;
  let mockWikidataClient;
  let mockStoreUrls;

  beforeEach(() => {
    jest.resetModules();
    clearMockStorage();

    // Create mock Cache
    mockCache = {
      getFromCache: jest.fn().mockResolvedValue(null),
      saveToCache: jest.fn().mockResolvedValue(undefined),
      MANUAL_OVERRIDES: {
        '367520': { // Hollow Knight
          nintendo: 'available',
          playstation: 'available',
          xbox: 'available',
          steamdeck: 'available'
        }
      },
      PLATFORMS: ['nintendo', 'playstation', 'xbox', 'steamdeck']
    };
    globalThis.XCPW_Cache = mockCache;

    // Create mock WikidataClient
    mockWikidataClient = {
      queryBySteamAppId: jest.fn().mockResolvedValue({
        found: false,
        wikidataId: null,
        gameName: '',
        platforms: { nintendo: false, playstation: false, xbox: false, steamdeck: false },
        storeIds: { eshop: null, psStore: null, xbox: null, gog: null, epic: null }
      }),
      batchQueryBySteamAppIds: jest.fn().mockResolvedValue(new Map()),
      getStoreUrl: jest.fn().mockReturnValue(null)
    };
    globalThis.XCPW_WikidataClient = mockWikidataClient;

    // Create mock StoreUrls
    mockStoreUrls = {
      nintendo: jest.fn((name) => `https://nintendo.example.com/search/${encodeURIComponent(name)}`),
      playstation: jest.fn((name) => `https://playstation.example.com/search/${encodeURIComponent(name)}`),
      xbox: jest.fn((name) => `https://xbox.example.com/search/${encodeURIComponent(name)}`),
      steamdeck: jest.fn((name) => `https://steamdeck.example.com/search/${encodeURIComponent(name)}`)
    };
    globalThis.XCPW_StoreUrls = mockStoreUrls;

    // Load the resolver module
    require('../../src/resolver.js');
  });

  afterEach(() => {
    delete globalThis.XCPW_Cache;
    delete globalThis.XCPW_WikidataClient;
    delete globalThis.XCPW_StoreUrls;
    delete globalThis.XCPW_Resolver;
  });

  describe('exports', () => {
    it('should export XCPW_Resolver to globalThis', () => {
      expect(globalThis.XCPW_Resolver).toBeDefined();
      expect(typeof globalThis.XCPW_Resolver).toBe('object');
    });

    it('should export all required functions', () => {
      const Resolver = globalThis.XCPW_Resolver;
      expect(typeof Resolver.resolvePlatformData).toBe('function');
      expect(typeof Resolver.batchResolvePlatformData).toBe('function');
      expect(typeof Resolver.forceRefresh).toBe('function');
      expect(typeof Resolver.createFallbackEntry).toBe('function');
    });
  });

  describe('createFallbackEntry', () => {
    it('should create entry with unknown status for all platforms', () => {
      const Resolver = globalThis.XCPW_Resolver;
      const entry = Resolver.createFallbackEntry('12345', 'Test Game');

      expect(entry.appid).toBe('12345');
      expect(entry.gameName).toBe('Test Game');
      expect(entry.platforms.nintendo.status).toBe('unknown');
      expect(entry.platforms.playstation.status).toBe('unknown');
      expect(entry.platforms.xbox.status).toBe('unknown');
      expect(entry.platforms.steamdeck.status).toBe('unknown');
      expect(entry.source).toBe('fallback');
    });

    it('should include search URLs for all platforms', () => {
      const Resolver = globalThis.XCPW_Resolver;
      const entry = Resolver.createFallbackEntry('12345', 'Test Game');

      expect(entry.platforms.nintendo.storeUrl).toContain('nintendo');
      expect(entry.platforms.playstation.storeUrl).toContain('playstation');
      expect(entry.platforms.xbox.storeUrl).toContain('xbox');
      expect(entry.platforms.steamdeck.storeUrl).toContain('steamdeck');

      expect(mockStoreUrls.nintendo).toHaveBeenCalledWith('Test Game');
      expect(mockStoreUrls.playstation).toHaveBeenCalledWith('Test Game');
      expect(mockStoreUrls.steamdeck).toHaveBeenCalledWith('Test Game');
      expect(mockStoreUrls.xbox).toHaveBeenCalledWith('Test Game');
    });

    it('should set source to fallback', () => {
      const Resolver = globalThis.XCPW_Resolver;
      const entry = Resolver.createFallbackEntry('12345', 'Test Game');

      expect(entry.source).toBe('fallback');
      expect(entry.wikidataId).toBeNull();
    });

    it('should set resolvedAt and ttlDays', () => {
      const Resolver = globalThis.XCPW_Resolver;
      const before = Date.now();
      const entry = Resolver.createFallbackEntry('12345', 'Test Game');
      const after = Date.now();

      expect(entry.resolvedAt).toBeGreaterThanOrEqual(before);
      expect(entry.resolvedAt).toBeLessThanOrEqual(after);
      expect(entry.ttlDays).toBe(7);
    });
  });

  describe('resolvePlatformData', () => {
    it('should return cached entry when available', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      const cachedEntry = {
        appid: '12345',
        gameName: 'Cached Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://example.com/ns' },
          playstation: { status: 'unavailable', storeUrl: 'https://example.com/ps' },
          xbox: { status: 'unknown', storeUrl: 'https://example.com/xb' }
        },
        source: 'wikidata',
        resolvedAt: Date.now(),
        ttlDays: 7
      };

      mockCache.getFromCache.mockResolvedValueOnce(cachedEntry);

      const result = await Resolver.resolvePlatformData('12345', 'Cached Game');

      expect(result.fromCache).toBe(true);
      expect(result.entry).toEqual(cachedEntry);
      expect(mockWikidataClient.queryBySteamAppId).not.toHaveBeenCalled();
    });

    it('should update game name when cached entry has different name', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      const cachedEntry = {
        appid: '12345',
        gameName: 'Old Name',
        platforms: {
          nintendo: { status: 'unknown', storeUrl: 'https://old-url/ns' },
          playstation: { status: 'available', storeUrl: 'https://official-url/ps' },
          xbox: { status: 'unknown', storeUrl: 'https://old-url/xb' },
          steamdeck: { status: 'unknown', storeUrl: 'https://old-url/sd' }
        },
        source: 'wikidata',
        resolvedAt: Date.now(),
        ttlDays: 7
      };

      mockCache.getFromCache.mockResolvedValueOnce(cachedEntry);

      const result = await Resolver.resolvePlatformData('12345', 'New Name');

      expect(result.fromCache).toBe(true);
      expect(result.entry.gameName).toBe('New Name');

      // Should update unknown platform URLs but NOT official URLs
      expect(mockStoreUrls.nintendo).toHaveBeenCalledWith('New Name');
      expect(mockStoreUrls.xbox).toHaveBeenCalledWith('New Name');

      // Should save updated entry
      expect(mockCache.saveToCache).toHaveBeenCalled();
    });

    it('should use manual override when available', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      const result = await Resolver.resolvePlatformData('367520', 'Hollow Knight');

      expect(result.fromCache).toBe(false);
      expect(result.entry.source).toBe('manual');
      expect(result.entry.platforms.nintendo.status).toBe('available');
      expect(result.entry.platforms.playstation.status).toBe('available');
      expect(result.entry.platforms.xbox.status).toBe('available');
      expect(result.entry.platforms.steamdeck.status).toBe('available');

      // Should save to cache
      expect(mockCache.saveToCache).toHaveBeenCalled();
    });

    it('should query Wikidata when not in cache and no manual override', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      mockWikidataClient.queryBySteamAppId.mockResolvedValueOnce({
        found: true,
        wikidataId: 'Q12345',
        gameName: 'Test Game',
        platforms: { nintendo: true, playstation: false, xbox: true, steamdeck: false },
        storeIds: { eshop: 'test-eshop', psStore: null, xbox: 'test-xbox' }
      });

      mockWikidataClient.getStoreUrl
        .mockReturnValueOnce('https://official.nintendo.com/test')
        .mockReturnValueOnce(null)
        .mockReturnValueOnce('https://official.xbox.com/test');

      const result = await Resolver.resolvePlatformData('99999', 'Test Game');

      expect(result.fromCache).toBe(false);
      expect(result.entry.source).toBe('wikidata');
      expect(result.entry.platforms.nintendo.status).toBe('available');
      expect(result.entry.platforms.playstation.status).toBe('unavailable');
      expect(result.entry.platforms.xbox.status).toBe('available');

      // Should use official URLs when available
      expect(result.entry.platforms.nintendo.storeUrl).toBe('https://official.nintendo.com/test');
      expect(result.entry.platforms.xbox.storeUrl).toBe('https://official.xbox.com/test');

      // Should use search URL when no official URL
      expect(result.entry.platforms.playstation.storeUrl).toContain('playstation');

      expect(mockCache.saveToCache).toHaveBeenCalled();
    });

    it('should create fallback entry and cache it when Wikidata returns not found', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      mockWikidataClient.queryBySteamAppId.mockResolvedValueOnce({
        found: false,
        wikidataId: null,
        gameName: '',
        platforms: { nintendo: false, playstation: false, xbox: false, steamdeck: false },
        storeIds: {}
      });

      const result = await Resolver.resolvePlatformData('99999', 'Unknown Game');

      expect(result.fromCache).toBe(false);
      expect(result.entry.source).toBe('fallback');
      expect(result.entry.platforms.nintendo.status).toBe('unknown');

      // Should cache even "not found" results
      expect(mockCache.saveToCache).toHaveBeenCalled();
    });

    it('should NOT cache when Wikidata query fails with error', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      mockWikidataClient.queryBySteamAppId.mockRejectedValueOnce(new Error('Network error'));

      const result = await Resolver.resolvePlatformData('99999', 'Test Game');

      expect(result.fromCache).toBe(false);
      expect(result.entry.source).toBe('fallback');

      // Should NOT cache transient failures
      expect(mockCache.saveToCache).not.toHaveBeenCalled();
    });

    it('should throw error when Cache module is missing', async () => {
      delete globalThis.XCPW_Cache;
      jest.resetModules();

      globalThis.XCPW_WikidataClient = mockWikidataClient;
      globalThis.XCPW_StoreUrls = mockStoreUrls;
      require('../../src/resolver.js');

      const Resolver = globalThis.XCPW_Resolver;

      await expect(Resolver.resolvePlatformData('12345', 'Test')).rejects.toThrow('Cache module not loaded');
    });

    it('should throw error when WikidataClient module is missing', async () => {
      delete globalThis.XCPW_WikidataClient;
      jest.resetModules();

      globalThis.XCPW_Cache = mockCache;
      globalThis.XCPW_StoreUrls = mockStoreUrls;
      require('../../src/resolver.js');

      const Resolver = globalThis.XCPW_Resolver;

      await expect(Resolver.resolvePlatformData('12345', 'Test')).rejects.toThrow('WikidataClient module not loaded');
    });

    it('should handle Wikidata QID as game name by using Steam name instead', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      // Sometimes Wikidata returns QID instead of label
      mockWikidataClient.queryBySteamAppId.mockResolvedValueOnce({
        found: true,
        wikidataId: 'Q12345',
        gameName: 'Q12345', // QID instead of actual name
        platforms: { nintendo: true, playstation: false, xbox: false, steamdeck: false },
        storeIds: {}
      });

      const result = await Resolver.resolvePlatformData('99999', 'Real Game Name');

      // Should use Steam's game name when Wikidata returns QID
      expect(result.entry.gameName).toBe('Real Game Name');
    });
  });

  describe('batchResolvePlatformData', () => {
    it('should return cached entries without querying Wikidata', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      const cachedEntry = {
        appid: '11111',
        gameName: 'Cached Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'url' },
          playstation: { status: 'available', storeUrl: 'url' },
          xbox: { status: 'available', storeUrl: 'url' }
        },
        source: 'wikidata',
        resolvedAt: Date.now(),
        ttlDays: 7
      };

      mockCache.getFromCache
        .mockResolvedValueOnce(cachedEntry)
        .mockResolvedValueOnce(null);

      const games = [
        { appid: '11111', gameName: 'Cached Game' },
        { appid: '22222', gameName: 'New Game' }
      ];

      const wikidataResults = new Map();
      wikidataResults.set('22222', {
        found: true,
        wikidataId: 'Q22222',
        gameName: 'New Game',
        platforms: { nintendo: false, playstation: true, xbox: false, steamdeck: false },
        storeIds: {}
      });
      mockWikidataClient.batchQueryBySteamAppIds.mockResolvedValueOnce(wikidataResults);

      const results = await Resolver.batchResolvePlatformData(games);

      expect(results.size).toBe(2);
      expect(results.get('11111').fromCache).toBe(true);
      expect(results.get('22222').fromCache).toBe(false);

      // Should only batch query for non-cached game
      expect(mockWikidataClient.batchQueryBySteamAppIds).toHaveBeenCalledWith(['22222']);
    });

    it('should handle all games in cache', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      const cachedEntry1 = { appid: '11111', gameName: 'Game 1', platforms: {}, source: 'cache', resolvedAt: Date.now(), ttlDays: 7 };
      const cachedEntry2 = { appid: '22222', gameName: 'Game 2', platforms: {}, source: 'cache', resolvedAt: Date.now(), ttlDays: 7 };

      mockCache.getFromCache
        .mockResolvedValueOnce(cachedEntry1)
        .mockResolvedValueOnce(cachedEntry2);

      const games = [
        { appid: '11111', gameName: 'Game 1' },
        { appid: '22222', gameName: 'Game 2' }
      ];

      const results = await Resolver.batchResolvePlatformData(games);

      expect(results.size).toBe(2);
      expect(mockWikidataClient.batchQueryBySteamAppIds).not.toHaveBeenCalled();
    });

    it('should handle manual overrides in batch', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      // 367520 is Hollow Knight with manual override
      const games = [
        { appid: '367520', gameName: 'Hollow Knight' },
        { appid: '99999', gameName: 'Unknown Game' }
      ];

      mockWikidataClient.batchQueryBySteamAppIds.mockResolvedValueOnce(new Map());

      const results = await Resolver.batchResolvePlatformData(games);

      expect(results.size).toBe(2);
      expect(results.get('367520').entry.source).toBe('manual');
      expect(results.get('99999').entry.source).toBe('fallback');

      // Manual override should be cached
      expect(mockCache.saveToCache).toHaveBeenCalled();
    });

    it('should NOT cache when batch Wikidata query fails', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      mockWikidataClient.batchQueryBySteamAppIds.mockRejectedValueOnce(new Error('Network error'));

      const games = [{ appid: '99999', gameName: 'Test Game' }];

      const results = await Resolver.batchResolvePlatformData(games);

      expect(results.size).toBe(1);
      expect(results.get('99999').entry.source).toBe('fallback');

      // Should NOT cache transient failures
      // Only the cache check calls saveToCache, not the failed Wikidata query
      const saveCallsAfterError = mockCache.saveToCache.mock.calls.filter(
        call => call[0].appid === '99999'
      );
      expect(saveCallsAfterError.length).toBe(0);
    });

    it('should handle empty input array', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      const results = await Resolver.batchResolvePlatformData([]);

      expect(results.size).toBe(0);
    });
  });

  describe('forceRefresh', () => {
    it('should remove from cache and resolve fresh', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      mockWikidataClient.queryBySteamAppId.mockResolvedValueOnce({
        found: true,
        wikidataId: 'Q12345',
        gameName: 'Fresh Game',
        platforms: { nintendo: true, playstation: true, xbox: true, steamdeck: false },
        storeIds: {}
      });

      const result = await Resolver.forceRefresh('12345', 'Fresh Game');

      // Should have removed from storage
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('xcpw_cache_12345');

      // Should return fresh data
      expect(result.fromCache).toBe(false);
      expect(result.entry.source).toBe('wikidata');
    });

    it('should use correct cache key format', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      mockWikidataClient.queryBySteamAppId.mockResolvedValueOnce({
        found: false,
        wikidataId: null,
        gameName: '',
        platforms: { nintendo: false, playstation: false, xbox: false, steamdeck: false },
        storeIds: {}
      });

      await Resolver.forceRefresh('98765', 'Test');

      expect(chrome.storage.local.remove).toHaveBeenCalledWith('xcpw_cache_98765');
    });
  });

  describe('resolution priority', () => {
    it('should check in order: cache -> manual override -> wikidata', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      // No cache hit
      mockCache.getFromCache.mockResolvedValueOnce(null);

      // No manual override for this appid (not 367520)
      mockWikidataClient.queryBySteamAppId.mockResolvedValueOnce({
        found: true,
        wikidataId: 'Q99999',
        gameName: 'Test',
        platforms: { nintendo: true, playstation: false, xbox: false, steamdeck: false },
        storeIds: {}
      });

      await Resolver.resolvePlatformData('99999', 'Test');

      // Should have checked cache first
      expect(mockCache.getFromCache).toHaveBeenCalledWith('99999');

      // Should have queried Wikidata (no manual override)
      expect(mockWikidataClient.queryBySteamAppId).toHaveBeenCalledWith('99999');
    });

    it('should stop at cache if found', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      mockCache.getFromCache.mockResolvedValueOnce({
        appid: '99999',
        gameName: 'Cached',
        platforms: {},
        source: 'cache'
      });

      await Resolver.resolvePlatformData('99999', 'Cached');

      expect(mockCache.getFromCache).toHaveBeenCalled();
      expect(mockWikidataClient.queryBySteamAppId).not.toHaveBeenCalled();
    });

    it('should stop at manual override if found', async () => {
      const Resolver = globalThis.XCPW_Resolver;

      // 367520 has manual override
      await Resolver.resolvePlatformData('367520', 'Hollow Knight');

      expect(mockCache.getFromCache).toHaveBeenCalled();
      expect(mockWikidataClient.queryBySteamAppId).not.toHaveBeenCalled();
    });
  });
});
