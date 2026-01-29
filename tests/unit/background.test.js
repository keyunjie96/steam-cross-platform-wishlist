/**
 * Unit tests for background.js
 */

describe('background.js', () => {
  let mockResolver;
  let mockCache;
  let messageHandler;

  beforeEach(() => {
    jest.resetModules();

    // Clear previous listener registrations
    chrome.runtime.onMessage.addListener.mockClear();

    // Create mock Resolver
    mockResolver = {
      resolvePlatformData: jest.fn().mockResolvedValue({
        entry: {
          appid: '12345',
          gameName: 'Test Game',
          platforms: {
            nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
            playstation: { status: 'unavailable', storeUrl: 'https://ps.example.com' },
            xbox: { status: 'unknown', storeUrl: 'https://xb.example.com' }
          },
          source: 'wikidata',
          resolvedAt: Date.now(),
          ttlDays: 7
        },
        fromCache: false
      }),
      forceRefresh: jest.fn().mockResolvedValue({
        entry: { appid: '12345' },
        fromCache: false
      })
    };
    globalThis.SCPW_Resolver = mockResolver;

    // Create mock Cache
    mockCache = {
      getCacheStats: jest.fn().mockResolvedValue({ count: 5, oldestEntry: Date.now() - 86400000 }),
      clearCache: jest.fn().mockResolvedValue(undefined)
    };
    globalThis.SCPW_Cache = mockCache;

    // Mock importScripts (used in service workers)
    globalThis.importScripts = jest.fn();

    // Load background.js
    require('../../dist/background.js');

    // Capture the message handler that was registered
    messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  });

  afterEach(() => {
    delete globalThis.SCPW_Resolver;
    delete globalThis.SCPW_Cache;
    delete globalThis.importScripts;
  });

  describe('initialization', () => {
    it('should register message listener', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(typeof messageHandler).toBe('function');
    });

    it('should call importScripts for dependencies', () => {
      expect(globalThis.importScripts).toHaveBeenCalledWith(
        'types.js', 'cache.js', 'wikidataClient.js', 'hltbClient.js', 'reviewScoresClient.js', 'resolver.js'
      );
    });
  });

  describe('message handling', () => {
    it('should reject invalid messages without type', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({}, {}, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message format'
      });
    });

    it('should reject null messages', () => {
      const sendResponse = jest.fn();
      const result = messageHandler(null, {}, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message format'
      });
    });

    it('should reject unknown message types', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({ type: 'UNKNOWN_TYPE' }, {}, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown message type: UNKNOWN_TYPE'
      });
    });
  });

  describe('GET_PLATFORM_DATA', () => {
    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({
        type: 'GET_PLATFORM_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should call resolver with appid and gameName', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockResolver.resolvePlatformData).toHaveBeenCalledWith('12345', 'Test Game');
    });

    it('should send success response with data', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          appid: '12345',
          gameName: 'Test Game',
          platforms: expect.any(Object)
        }),
        fromCache: false
      });
    });

    it('should handle cached responses', async () => {
      mockResolver.resolvePlatformData.mockResolvedValueOnce({
        entry: { appid: '12345', gameName: 'Cached Game', platforms: {} },
        fromCache: true
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA',
        appid: '12345',
        gameName: 'Cached Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ appid: '12345' }),
        fromCache: true
      });
    });

    it('should fail when appid is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        fromCache: false
      });
    });

    it('should fail when gameName is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA',
        appid: '12345'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        fromCache: false
      });
    });

    it('should fail when resolver is not available', async () => {
      delete globalThis.SCPW_Resolver;

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA',
        appid: '12345',
        gameName: 'Test'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        fromCache: false,
        error: 'Resolver not loaded'
      });
    });

    it('should handle resolver errors', async () => {
      mockResolver.resolvePlatformData.mockRejectedValueOnce(new Error('Resolution failed'));

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA',
        appid: '12345',
        gameName: 'Test'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        fromCache: false
      });
    });
  });

  describe('GET_PLATFORM_DATA_BATCH', () => {
    beforeEach(() => {
      // Add batchResolvePlatformData to mock resolver
      mockResolver.batchResolvePlatformData = jest.fn().mockResolvedValue(
        new Map([
          ['12345', {
            entry: {
              appid: '12345',
              gameName: 'Test Game 1',
              platforms: {
                nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
                playstation: { status: 'unavailable', storeUrl: 'https://ps.example.com' },
                xbox: { status: 'unknown', storeUrl: 'https://xb.example.com' }
              },
              source: 'wikidata'
            },
            fromCache: false
          }],
          ['67890', {
            entry: {
              appid: '67890',
              gameName: 'Test Game 2',
              platforms: {
                nintendo: { status: 'unavailable', storeUrl: 'https://ns.example.com' },
                playstation: { status: 'available', storeUrl: 'https://ps.example.com' },
                xbox: { status: 'available', storeUrl: 'https://xb.example.com' }
              },
              source: 'cache'
            },
            fromCache: true
          }]
        ])
      );
    });

    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: [
          { appid: '12345', gameName: 'Test Game 1' },
          { appid: '67890', gameName: 'Test Game 2' }
        ]
      }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should call batchResolvePlatformData with games array', async () => {
      const sendResponse = jest.fn();
      const games = [
        { appid: '12345', gameName: 'Test Game 1' },
        { appid: '67890', gameName: 'Test Game 2' }
      ];

      messageHandler({
        type: 'GET_PLATFORM_DATA_BATCH',
        games
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockResolver.batchResolvePlatformData).toHaveBeenCalledWith(games);
    });

    it('should send success response with results object', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: [
          { appid: '12345', gameName: 'Test Game 1' },
          { appid: '67890', gameName: 'Test Game 2' }
        ]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        results: {
          '12345': {
            data: expect.objectContaining({ appid: '12345' }),
            fromCache: false
          },
          '67890': {
            data: expect.objectContaining({ appid: '67890' }),
            fromCache: true
          }
        }
      });
    });

    it('should fail when games is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA_BATCH'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        results: {}
      });
    });

    it('should fail when games is not an array', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: 'not-an-array'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        results: {}
      });
    });

    it('should fail when games array is empty', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: []
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        results: {}
      });
    });

    it('should fail when resolver is not available', async () => {
      delete globalThis.SCPW_Resolver;

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Test' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        results: {},
        error: 'Resolver not loaded'
      });
    });

    it('should handle batchResolvePlatformData errors', async () => {
      mockResolver.batchResolvePlatformData.mockRejectedValueOnce(new Error('Batch resolution failed'));

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Test' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        results: {}
      });
    });
  });

  describe('UPDATE_CACHE', () => {
    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({
        type: 'UPDATE_CACHE',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should call forceRefresh with appid and gameName', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'UPDATE_CACHE',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockResolver.forceRefresh).toHaveBeenCalledWith('12345', 'Test Game');
    });

    it('should send success response', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'UPDATE_CACHE',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should fail when appid is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'UPDATE_CACHE',
        gameName: 'Test'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    });

    it('should fail when gameName is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'UPDATE_CACHE',
        appid: '12345'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    });

    it('should handle forceRefresh errors', async () => {
      mockResolver.forceRefresh.mockRejectedValueOnce(new Error('Refresh failed'));

      const sendResponse = jest.fn();
      messageHandler({
        type: 'UPDATE_CACHE',
        appid: '12345',
        gameName: 'Test'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('GET_CACHE_STATS', () => {
    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({ type: 'GET_CACHE_STATS' }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should call getCacheStats', async () => {
      const sendResponse = jest.fn();
      messageHandler({ type: 'GET_CACHE_STATS' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockCache.getCacheStats).toHaveBeenCalled();
    });

    it('should send stats in response', async () => {
      const sendResponse = jest.fn();
      messageHandler({ type: 'GET_CACHE_STATS' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        count: 5,
        oldestEntry: expect.any(Number)
      });
    });

    // Regression test: handler must wrap cache response with success property
    // Background: cache.js exports getCacheStats which returns {count, oldestEntry}.
    // The handler must wrap this with {success: true, ...} for the options page.
    // Previously, a function name collision caused the raw cache response to be sent.
    it('should wrap cache response with success property (regression test)', async () => {
      // Simulate cache returning raw data without success property
      mockCache.getCacheStats.mockResolvedValueOnce({ count: 10, oldestEntry: 12345 });

      const sendResponse = jest.fn();
      messageHandler({ type: 'GET_CACHE_STATS' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      const response = sendResponse.mock.calls[0][0];

      // Must have success property (not just count/oldestEntry from cache)
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('count', 10);
      expect(response).toHaveProperty('oldestEntry', 12345);

      // Verify we're not just passing through the cache response
      expect(Object.keys(response)).toContain('success');
    });

    it('should handle errors', async () => {
      mockCache.getCacheStats.mockRejectedValueOnce(new Error('Stats failed'));

      const sendResponse = jest.fn();
      messageHandler({ type: 'GET_CACHE_STATS' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('CLEAR_CACHE', () => {
    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({ type: 'CLEAR_CACHE' }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should call clearCache', async () => {
      const sendResponse = jest.fn();
      messageHandler({ type: 'CLEAR_CACHE' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockCache.clearCache).toHaveBeenCalled();
    });

    it('should send success response', async () => {
      const sendResponse = jest.fn();
      messageHandler({ type: 'CLEAR_CACHE' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    // Regression test: handler must return {success: true}, not undefined from cache.clearCache
    // Previously, a function name collision caused undefined to be sent instead.
    it('should return success object not cache return value (regression test)', async () => {
      // cache.clearCache returns undefined
      mockCache.clearCache.mockResolvedValueOnce(undefined);

      const sendResponse = jest.fn();
      messageHandler({ type: 'CLEAR_CACHE' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      const response = sendResponse.mock.calls[0][0];
      expect(response).toEqual({ success: true });
      expect(response).not.toBeUndefined();
    });

    it('should handle errors', async () => {
      mockCache.clearCache.mockRejectedValueOnce(new Error('Clear failed'));

      const sendResponse = jest.fn();
      messageHandler({ type: 'CLEAR_CACHE' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('GET_CACHE_EXPORT', () => {
    it('should return true for async response', () => {
      mockCache.getAllCacheEntries = jest.fn().mockResolvedValue([]);
      const sendResponse = jest.fn();
      const result = messageHandler({ type: 'GET_CACHE_EXPORT' }, {}, sendResponse);
      expect(result).toBe(true);
    });

    it('should call getAllCacheEntries and return entries', async () => {
      const entries = [
        { appid: '123', gameName: 'Game A', resolvedAt: Date.now(), ttlDays: 7 },
        { appid: '456', gameName: 'Game B', resolvedAt: Date.now(), ttlDays: 7 }
      ];
      mockCache.getAllCacheEntries = jest.fn().mockResolvedValue(entries);

      const sendResponse = jest.fn();
      messageHandler({ type: 'GET_CACHE_EXPORT' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockCache.getAllCacheEntries).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: entries
      });
    });

    it('should handle errors', async () => {
      mockCache.getAllCacheEntries = jest.fn().mockRejectedValue(new Error('Export failed'));

      const sendResponse = jest.fn();
      messageHandler({ type: 'GET_CACHE_EXPORT' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('GET_HLTB_DATA', () => {
    let mockHltbClient;

    beforeEach(() => {
      mockHltbClient = {
        queryByGameName: jest.fn().mockResolvedValue({
          hltbId: 12345,
          gameName: 'Test Game',
          similarity: 1,
          data: {
            mainStory: 10,
            mainExtra: 20,
            completionist: 40,
            allStyles: 25,
            steamId: 12345
          }
        }),
        batchQueryByGameNames: jest.fn()
      };
      globalThis.SCPW_HltbClient = mockHltbClient;

      // Also set up getFromCache for HLTB tests
      mockCache.getFromCache = jest.fn().mockResolvedValue(null);
      mockCache.saveToCache = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
      delete globalThis.SCPW_HltbClient;
    });

    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should fail when appid is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'Missing appid or gameName'
      });
    });

    it('should fail when gameName is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'Missing appid or gameName'
      });
    });

    it('should fail when HLTB client is not available', async () => {
      delete globalThis.SCPW_HltbClient;

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'HLTB client not loaded'
      });
    });

    it('should return cached HLTB data if available', async () => {
      const cachedHltbData = {
        hltbId: 12345,
        mainStory: 15,
        mainExtra: 25,
        completionist: 50,
        allStyles: 30,
        steamId: 12345
      };
      mockCache.getFromCache.mockResolvedValueOnce({
        appid: '12345',
        hltbData: cachedHltbData
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: cachedHltbData
      });
      expect(mockHltbClient.queryByGameName).not.toHaveBeenCalled();
    });

    it('should query HLTB when not cached', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockHltbClient.queryByGameName).toHaveBeenCalledWith('Test Game', '12345');
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          mainStory: 10,
          mainExtra: 20
        })
      });
    });

    it('should return null when no HLTB match found', async () => {
      mockHltbClient.queryByGameName.mockResolvedValueOnce(null);

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Unknown Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: null
      });
    });

    it('should handle HLTB client errors', async () => {
      mockHltbClient.queryByGameName.mockRejectedValueOnce(new Error('HLTB API error'));

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'HLTB API error'
      });
    });

    it('should re-query when cached HLTB data has all zero times', async () => {
      // Cache has HLTB data with valid ID but all times are 0
      const cachedEntry = {
        appid: '12345',
        gameName: 'Test Game',
        hltbData: {
          hltbId: 999,
          mainStory: 0,
          mainExtra: 0,
          completionist: 0,
          allStyles: 0,
          steamId: null
        }
      };
      mockCache.getFromCache.mockResolvedValueOnce(cachedEntry);

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should re-query since all times are 0
      expect(mockHltbClient.queryByGameName).toHaveBeenCalledWith('Test Game', '12345');
    });

    it('should handle non-Error exceptions', async () => {
      // Throw a string instead of Error
      mockHltbClient.queryByGameName.mockRejectedValueOnce('String error');

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'String error'
      });
    });

    it('should update cache with HLTB data', async () => {
      const cachedEntry = { appid: '12345', gameName: 'Test Game', hltbData: null };
      mockCache.getFromCache.mockResolvedValueOnce(cachedEntry);

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockCache.saveToCache).toHaveBeenCalledWith(
        expect.objectContaining({
          hltbData: expect.objectContaining({
            mainStory: 10
          })
        })
      );
    });

    it('should cache "not found" marker when HLTB returns no match', async () => {
      const cachedEntry = { appid: '12345', gameName: 'Unknown Game', hltbData: null };
      mockCache.getFromCache.mockResolvedValueOnce(cachedEntry);
      mockHltbClient.queryByGameName.mockResolvedValueOnce(null);

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Unknown Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should save "not found" marker with hltbId: -1
      expect(mockCache.saveToCache).toHaveBeenCalledWith(
        expect.objectContaining({
          hltbData: expect.objectContaining({
            hltbId: -1,
            mainStory: 0,
            mainExtra: 0,
            completionist: 0
          })
        })
      );
    });

    it('should return null without re-querying when cache has "not found" marker', async () => {
      // Cache has "not found" marker (hltbId: -1)
      const notFoundMarker = {
        hltbId: -1,
        mainStory: 0,
        mainExtra: 0,
        completionist: 0,
        allStyles: 0,
        steamId: null
      };
      mockCache.getFromCache.mockResolvedValueOnce({
        appid: '12345',
        hltbData: notFoundMarker
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA',
        appid: '12345',
        gameName: 'Unknown Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should return null without calling HLTB client
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: null
      });
      expect(mockHltbClient.queryByGameName).not.toHaveBeenCalled();
    });
  });

  describe('GET_HLTB_DATA_BATCH', () => {
    let mockHltbClient;

    beforeEach(() => {
      mockHltbClient = {
        queryByGameName: jest.fn(),
        batchQueryByGameNames: jest.fn().mockResolvedValue(
          new Map([
            ['12345', {
              hltbId: 1,
              gameName: 'Game 1',
              similarity: 1,
              data: { mainStory: 10, mainExtra: 20, completionist: 40, allStyles: 25, steamId: 12345 }
            }],
            ['67890', {
              hltbId: 2,
              gameName: 'Game 2',
              similarity: 1,
              data: { mainStory: 5, mainExtra: 10, completionist: 20, allStyles: 12, steamId: 67890 }
            }]
          ])
        )
      };
      globalThis.SCPW_HltbClient = mockHltbClient;

      mockCache.getFromCache = jest.fn().mockResolvedValue(null);
      mockCache.saveToCache = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
      delete globalThis.SCPW_HltbClient;
    });

    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [
          { appid: '12345', gameName: 'Game 1' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should fail when games is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        hltbResults: {}
      });
    });

    it('should fail when games is empty', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: []
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        hltbResults: {}
      });
    });

    it('should fail when HLTB client is not available', async () => {
      delete globalThis.SCPW_HltbClient;

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Test' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        hltbResults: {},
        error: 'HLTB client not loaded'
      });
    });

    it('should use cached HLTB data when available', async () => {
      const cachedHltbData = { hltbId: 12345, mainStory: 15, mainExtra: 25, completionist: 50, allStyles: 30, steamId: 12345 };
      mockCache.getFromCache.mockImplementation(async (appid) => {
        if (appid === '12345') {
          return { appid: '12345', hltbData: cachedHltbData };
        }
        return null;
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [
          { appid: '12345', gameName: 'Game 1' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should only query HLTB for uncached game
      expect(mockHltbClient.batchQueryByGameNames).toHaveBeenCalledWith([
        { appid: '67890', gameName: 'Game 2' }
      ]);
    });

    it('should return results for all games', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [
          { appid: '12345', gameName: 'Game 1' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        hltbResults: {
          '12345': expect.objectContaining({ mainStory: 10 }),
          '67890': expect.objectContaining({ mainStory: 5 })
        }
      });
    });

    it('should handle batch query errors', async () => {
      mockHltbClient.batchQueryByGameNames.mockRejectedValueOnce(new Error('Batch error'));

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Test' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        hltbResults: { '12345': null }
      });
    });

    it('should handle null results from HLTB', async () => {
      mockHltbClient.batchQueryByGameNames.mockResolvedValueOnce(
        new Map([['12345', null]])
      );

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Unknown Game' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        hltbResults: { '12345': null }
      });
    });

    it('should cache "not found" marker for games with no HLTB match', async () => {
      const cachedEntry = { appid: '12345', gameName: 'Unknown Game', hltbData: null };
      mockCache.getFromCache.mockResolvedValue(cachedEntry);
      mockHltbClient.batchQueryByGameNames.mockResolvedValueOnce(
        new Map([['12345', null]])
      );

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Unknown Game' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should save "not found" marker with hltbId: -1
      expect(mockCache.saveToCache).toHaveBeenCalledWith(
        expect.objectContaining({
          hltbData: expect.objectContaining({
            hltbId: -1,
            mainStory: 0
          })
        })
      );
    });

    it('should skip re-querying games with "not found" marker in cache', async () => {
      // Game 1 has "not found" marker, Game 2 needs querying
      const notFoundMarker = {
        hltbId: -1,
        mainStory: 0,
        mainExtra: 0,
        completionist: 0,
        allStyles: 0,
        steamId: null
      };
      mockCache.getFromCache.mockImplementation(async (appid) => {
        if (appid === '12345') {
          return { appid: '12345', hltbData: notFoundMarker };
        }
        return null;
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [
          { appid: '12345', gameName: 'Unknown Game' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should only query HLTB for game without "not found" marker
      expect(mockHltbClient.batchQueryByGameNames).toHaveBeenCalledWith([
        { appid: '67890', gameName: 'Game 2' }
      ]);

      // Response should include null for "not found" game
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          hltbResults: expect.objectContaining({
            '12345': null
          })
        })
      );
    });

    it('should update existing cache entry with HLTB data when found', async () => {
      // Set up: game has a cache entry (from Wikidata) but no HLTB data yet
      const existingCacheEntry = {
        appid: '12345',
        gameName: 'Game 1',
        hltbData: null,
        platforms: {}
      };

      // Return the existing cache entry when checking cache
      mockCache.getFromCache.mockImplementation(async (appid) => {
        if (appid === '12345') {
          return existingCacheEntry;
        }
        return null;
      });

      // HLTB finds a match
      mockHltbClient.batchQueryByGameNames.mockResolvedValueOnce(
        new Map([
          ['12345', {
            hltbId: 9999,
            gameName: 'Game 1',
            similarity: 1,
            data: { mainStory: 15, mainExtra: 25, completionist: 50, allStyles: 30, steamId: 12345, hltbId: 9999 }
          }]
        ])
      );

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_HLTB_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Game 1' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // The cache entry should be updated with HLTB data
      expect(mockCache.saveToCache).toHaveBeenCalledWith(
        expect.objectContaining({
          appid: '12345',
          hltbData: expect.objectContaining({
            mainStory: 15,
            hltbId: 9999
          })
        })
      );
    });
  });

  describe('GET_REVIEW_SCORES', () => {
    let mockReviewScoresClient;

    beforeEach(() => {
      mockReviewScoresClient = {
        queryByGameName: jest.fn().mockResolvedValue({
          openCriticId: 7015,
          gameName: 'Test Game',
          similarity: 1,
          data: {
            openCriticId: 7015,
            score: 90,
            tier: 'Mighty',
            numReviews: 75,
            percentRecommended: 95
          }
        }),
        batchQueryByGameNames: jest.fn()
      };
      globalThis.SCPW_ReviewScoresClient = mockReviewScoresClient;

      // Reset cache mock to return null by default
      mockCache.getFromCache = jest.fn().mockResolvedValue(null);
      mockCache.saveToCache = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
      delete globalThis.SCPW_ReviewScoresClient;
    });

    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should fail when appid is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'Missing appid or gameName'
      });
    });

    it('should fail when gameName is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'Missing appid or gameName'
      });
    });

    it('should fail when review scores client is not available', async () => {
      delete globalThis.SCPW_ReviewScoresClient;

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'Review scores client not loaded'
      });
    });

    it('should return cached review score data if available', async () => {
      const cachedReviewScoreData = {
        openCriticId: 7015,
        score: 90,
        tier: 'Mighty',
        numReviews: 75,
        percentRecommended: 95
      };
      mockCache.getFromCache.mockResolvedValueOnce({
        appid: '12345',
        reviewScoreData: cachedReviewScoreData
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: cachedReviewScoreData
      });
      expect(mockReviewScoresClient.queryByGameName).not.toHaveBeenCalled();
    });

    it('should query review scores when not cached', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockReviewScoresClient.queryByGameName).toHaveBeenCalledWith('Test Game');
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          score: 90,
          tier: 'Mighty'
        })
      });
    });

    it('should return null when no review score match found', async () => {
      mockReviewScoresClient.queryByGameName.mockResolvedValueOnce(null);

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Unknown Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: null
      });
    });

    it('should handle review scores client errors', async () => {
      mockReviewScoresClient.queryByGameName.mockRejectedValueOnce(new Error('OpenCritic API error'));

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'OpenCritic API error'
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockReviewScoresClient.queryByGameName.mockRejectedValueOnce('String error');

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: 'String error'
      });
    });

    it('should update cache with review score data', async () => {
      const cachedEntry = { appid: '12345', gameName: 'Test Game', reviewScoreData: null };
      mockCache.getFromCache.mockResolvedValueOnce(cachedEntry);

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Test Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockCache.saveToCache).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewScoreData: expect.objectContaining({
            score: 90
          })
        })
      );
    });

    it('should cache "not found" marker when review scores returns no match', async () => {
      const cachedEntry = { appid: '12345', gameName: 'Unknown Game', reviewScoreData: null };
      mockCache.getFromCache.mockResolvedValueOnce(cachedEntry);
      mockReviewScoresClient.queryByGameName.mockResolvedValueOnce(null);

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Unknown Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should save "not found" marker with openCriticId: -1
      expect(mockCache.saveToCache).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewScoreData: expect.objectContaining({
            openCriticId: -1,
            score: 0,
            tier: 'Unknown'
          })
        })
      );
    });

    it('should return null without re-querying when cache has "not found" marker', async () => {
      const notFoundMarker = {
        openCriticId: -1,
        score: 0,
        tier: 'Unknown',
        numReviews: 0,
        percentRecommended: 0
      };
      mockCache.getFromCache.mockResolvedValueOnce({
        appid: '12345',
        gameName: 'Unknown Game',
        reviewScoreData: notFoundMarker
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES',
        appid: '12345',
        gameName: 'Unknown Game'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: null
      });
      expect(mockReviewScoresClient.queryByGameName).not.toHaveBeenCalled();
    });
  });

  describe('GET_REVIEW_SCORES_BATCH', () => {
    let mockReviewScoresClient;

    beforeEach(() => {
      mockReviewScoresClient = {
        queryByGameName: jest.fn(),
        batchQueryByGameNames: jest.fn().mockResolvedValue({
          results: new Map([
            ['12345', {
              openCriticId: 7015,
              gameName: 'Game 1',
              similarity: 1,
              data: { openCriticId: 7015, score: 90, tier: 'Mighty', numReviews: 75, percentRecommended: 95 }
            }],
            ['67890', {
              openCriticId: 7016,
              gameName: 'Game 2',
              similarity: 1,
              data: { openCriticId: 7016, score: 75, tier: 'Strong', numReviews: 50, percentRecommended: 80 }
            }]
          ]),
          failureReasons: {}
        })
      };
      globalThis.SCPW_ReviewScoresClient = mockReviewScoresClient;

      mockCache.getFromCache = jest.fn().mockResolvedValue(null);
      mockCache.saveToCache = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
      delete globalThis.SCPW_ReviewScoresClient;
    });

    it('should return true for async response', () => {
      const sendResponse = jest.fn();
      const result = messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: [
          { appid: '12345', gameName: 'Game 1' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      }, {}, sendResponse);

      expect(result).toBe(true);
    });

    it('should fail when games is missing', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH'
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        reviewScoresResults: {}
      });
    });

    it('should fail when games is empty', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: []
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        reviewScoresResults: {}
      });
    });

    it('should fail when review scores client is not available', async () => {
      delete globalThis.SCPW_ReviewScoresClient;

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: [{ appid: '12345', gameName: 'Test' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        reviewScoresResults: {},
        error: 'Review scores client not loaded'
      });
    });

    it('should use cached review score data when available', async () => {
      const cachedReviewScoreData = { openCriticId: 7015, score: 90, tier: 'Mighty', numReviews: 75, percentRecommended: 95 };
      mockCache.getFromCache.mockImplementation(async (appid) => {
        if (appid === '12345') {
          return { appid: '12345', reviewScoreData: cachedReviewScoreData };
        }
        return null;
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: [
          { appid: '12345', gameName: 'Game 1' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should only query for uncached game (includes openCriticId from Wikidata cache lookup)
      expect(mockReviewScoresClient.batchQueryByGameNames).toHaveBeenCalledWith([
        { appid: '67890', gameName: 'Game 2', openCriticId: null }
      ]);
    });

    it('should return results for all games', async () => {
      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: [
          { appid: '12345', gameName: 'Game 1' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          reviewScoresResults: {
            '12345': expect.objectContaining({ score: 90 }),
            '67890': expect.objectContaining({ score: 75 })
          }
        })
      );
    });

    it('should handle batch query errors', async () => {
      mockReviewScoresClient.batchQueryByGameNames.mockRejectedValueOnce(new Error('Batch error'));

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: [{ appid: '12345', gameName: 'Test' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          reviewScoresResults: { '12345': null }
        })
      );
    });

    it('should handle null results from review scores', async () => {
      mockReviewScoresClient.batchQueryByGameNames.mockResolvedValueOnce({
        results: new Map([['12345', null]]),
        failureReasons: { '12345': 'no_search_results' }
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: [{ appid: '12345', gameName: 'Unknown Game' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          reviewScoresResults: { '12345': null }
        })
      );
    });

    it('should cache "not found" marker for games with no review score match', async () => {
      const cachedEntry = { appid: '12345', gameName: 'Unknown Game', reviewScoreData: null };
      mockCache.getFromCache.mockResolvedValue(cachedEntry);
      mockReviewScoresClient.batchQueryByGameNames.mockResolvedValueOnce({
        results: new Map([['12345', null]]),
        failureReasons: { '12345': 'no_search_results' }
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: [{ appid: '12345', gameName: 'Unknown Game' }]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should save "not found" marker with openCriticId: -1
      expect(mockCache.saveToCache).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewScoreData: expect.objectContaining({
            openCriticId: -1,
            score: 0
          })
        })
      );
    });

    it('should return null without re-querying when cache has "not found" marker', async () => {
      // "Not found" markers should block re-querying - prevents unnecessary API calls
      // (matches HLTB behavior)
      const notFoundMarker = {
        openCriticId: -1,
        score: 0,
        tier: 'Unknown',
        numReviews: 0,
        percentRecommended: 0
      };
      mockCache.getFromCache.mockImplementation(async (appid) => {
        if (appid === '12345') {
          return { appid: '12345', reviewScoreData: notFoundMarker };
        }
        return null;
      });

      const sendResponse = jest.fn();
      messageHandler({
        type: 'GET_REVIEW_SCORES_BATCH',
        games: [
          { appid: '12345', gameName: 'Unknown Game' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should only query Game 2 - "not found" marker for Unknown Game should return null
      expect(mockReviewScoresClient.batchQueryByGameNames).toHaveBeenCalledWith([
        { appid: '67890', gameName: 'Game 2', openCriticId: null }
      ]);

      // Verify the response includes null for the "not found" game
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          reviewScoresResults: expect.objectContaining({
            '12345': null
          })
        })
      );
    });
  });
});
