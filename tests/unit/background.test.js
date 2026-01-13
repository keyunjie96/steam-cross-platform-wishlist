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
    globalThis.XCPW_Resolver = mockResolver;

    // Create mock Cache
    mockCache = {
      getCacheStats: jest.fn().mockResolvedValue({ count: 5, oldestEntry: Date.now() - 86400000 }),
      clearCache: jest.fn().mockResolvedValue(undefined)
    };
    globalThis.XCPW_Cache = mockCache;

    // Mock importScripts (used in service workers)
    globalThis.importScripts = jest.fn();

    // Load background.js
    require('../../src/background.js');

    // Capture the message handler that was registered
    messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  });

  afterEach(() => {
    delete globalThis.XCPW_Resolver;
    delete globalThis.XCPW_Cache;
    delete globalThis.importScripts;
  });

  describe('initialization', () => {
    it('should register message listener', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(typeof messageHandler).toBe('function');
    });

    it('should call importScripts for dependencies', () => {
      expect(globalThis.importScripts).toHaveBeenCalledWith(
        'types.js', 'cache.js', 'wikidataClient.js', 'resolver.js'
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
      delete globalThis.XCPW_Resolver;

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

    it('should handle errors', async () => {
      mockCache.clearCache.mockRejectedValueOnce(new Error('Clear failed'));

      const sendResponse = jest.fn();
      messageHandler({ type: 'CLEAR_CACHE' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    });
  });
});
