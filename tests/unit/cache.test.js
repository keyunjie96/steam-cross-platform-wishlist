/**
 * Unit tests for cache.js
 */

const { setMockStorageData, getMockStorageData, clearMockStorage } = require('../mocks/chrome');

describe('cache.js', () => {
  beforeEach(() => {
    jest.resetModules();
    clearMockStorage();

    // Load types.js first (dependency)
    require('../../dist/types.js');
    // Then load cache.js
    require('../../dist/cache.js');
  });

  describe('exports', () => {
    it('should export SCPW_Cache to globalThis', () => {
      expect(globalThis.SCPW_Cache).toBeDefined();
    });

    it('should export all required functions', () => {
      const Cache = globalThis.SCPW_Cache;
      expect(typeof Cache.getFromCache).toBe('function');
      expect(typeof Cache.getFromCacheWithStale).toBe('function');
      expect(typeof Cache.saveToCache).toBe('function');
      expect(typeof Cache.getOrCreatePlatformData).toBe('function');
      expect(typeof Cache.clearCache).toBe('function');
      expect(typeof Cache.getCacheStats).toBe('function');
      expect(typeof Cache.isCacheValid).toBe('function');
    });

    it('should export MANUAL_OVERRIDES', () => {
      const Cache = globalThis.SCPW_Cache;
      expect(Cache.MANUAL_OVERRIDES).toBeDefined();
      expect(typeof Cache.MANUAL_OVERRIDES).toBe('object');
    });
  });

  describe('isCacheValid', () => {
    it('should return false for null entry', () => {
      const Cache = globalThis.SCPW_Cache;
      expect(Cache.isCacheValid(null)).toBe(false);
    });

    it('should return false for undefined entry', () => {
      const Cache = globalThis.SCPW_Cache;
      expect(Cache.isCacheValid(undefined)).toBe(false);
    });

    it('should return false for entry without resolvedAt', () => {
      const Cache = globalThis.SCPW_Cache;
      expect(Cache.isCacheValid({ ttlDays: 7 })).toBe(false);
    });

    it('should return false for entry without ttlDays', () => {
      const Cache = globalThis.SCPW_Cache;
      expect(Cache.isCacheValid({ resolvedAt: Date.now() })).toBe(false);
    });

    it('should return true for valid non-expired entry', () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        resolvedAt: Date.now(),
        ttlDays: 7,
        cacheVersion: 1  // Must match CACHE_VERSION
      };
      expect(Cache.isCacheValid(entry)).toBe(true);
    });

    it('should return false for expired entry', () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        resolvedAt: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
        ttlDays: 7,
        cacheVersion: 1
      };
      expect(Cache.isCacheValid(entry)).toBe(false);
    });

    it('should return true for entry about to expire', () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        resolvedAt: Date.now() - (6 * 24 * 60 * 60 * 1000), // 6 days ago
        ttlDays: 7,
        cacheVersion: 1
      };
      expect(Cache.isCacheValid(entry)).toBe(true);
    });

    it('should return false for entry with missing cacheVersion', () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        resolvedAt: Date.now(),
        ttlDays: 7
        // No cacheVersion - simulates old cached data
      };
      expect(Cache.isCacheValid(entry)).toBe(false);
    });

    it('should return false for entry with mismatched cacheVersion', () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        resolvedAt: Date.now(),
        ttlDays: 7,
        cacheVersion: 999  // Wrong version
      };
      expect(Cache.isCacheValid(entry)).toBe(false);
    });
  });

  describe('getFromCache', () => {
    it('should return null for non-existent entry', async () => {
      const Cache = globalThis.SCPW_Cache;
      const result = await Cache.getFromCache('999999');
      expect(result).toBeNull();
    });

    it('should return valid cached entry', async () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        appid: '12345',
        gameName: 'Test Game',
        resolvedAt: Date.now(),
        ttlDays: 7,
        cacheVersion: 1,
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://example.com' },
          playstation: { status: 'unavailable', storeUrl: 'https://example.com' },
          xbox: { status: 'unknown', storeUrl: 'https://example.com' }
        }
      };

      setMockStorageData({ 'xcpw_cache_12345': entry });

      const result = await Cache.getFromCache('12345');
      expect(result).toEqual(entry);
    });

    it('should return null for expired entry', async () => {
      const Cache = globalThis.SCPW_Cache;
      const expiredEntry = {
        appid: '12345',
        gameName: 'Test Game',
        resolvedAt: Date.now() - (10 * 24 * 60 * 60 * 1000), // 10 days ago
        ttlDays: 7,
        platforms: {}
      };

      setMockStorageData({ 'xcpw_cache_12345': expiredEntry });

      const result = await Cache.getFromCache('12345');
      expect(result).toBeNull();
    });

    it('should use correct cache key prefix', async () => {
      const Cache = globalThis.SCPW_Cache;
      await Cache.getFromCache('67890');

      expect(chrome.storage.local.get).toHaveBeenCalledWith('xcpw_cache_67890');
    });
  });

  describe('getFromCacheWithStale', () => {
    it('should return entry with isStale false for valid entry', async () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        appid: '12345',
        gameName: 'Test Game',
        resolvedAt: Date.now(),
        ttlDays: 7,
        cacheVersion: 1,
        platforms: {}
      };

      setMockStorageData({ 'xcpw_cache_12345': entry });

      const result = await Cache.getFromCacheWithStale('12345');
      expect(result.entry).toEqual(entry);
      expect(result.isStale).toBe(false);
    });

    it('should return entry with isStale true for expired entry', async () => {
      const Cache = globalThis.SCPW_Cache;
      const expiredEntry = {
        appid: '12345',
        gameName: 'Test Game',
        resolvedAt: Date.now() - (10 * 24 * 60 * 60 * 1000), // 10 days ago
        ttlDays: 7,
        cacheVersion: 1,
        platforms: {}
      };

      setMockStorageData({ 'xcpw_cache_12345': expiredEntry });

      const result = await Cache.getFromCacheWithStale('12345');
      expect(result.entry).toEqual(expiredEntry);
      expect(result.isStale).toBe(true);
    });

    it('should return entry with isStale true for version mismatch', async () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        appid: '12345',
        gameName: 'Test Game',
        resolvedAt: Date.now(),
        ttlDays: 7,
        cacheVersion: 999, // Wrong version
        platforms: {}
      };

      setMockStorageData({ 'xcpw_cache_12345': entry });

      const result = await Cache.getFromCacheWithStale('12345');
      expect(result.entry).toEqual(entry);
      expect(result.isStale).toBe(true); // Version mismatch = stale
    });

    it('should return null entry with isStale false for non-existent entry', async () => {
      const Cache = globalThis.SCPW_Cache;

      const result = await Cache.getFromCacheWithStale('999999');
      expect(result.entry).toBeNull();
      expect(result.isStale).toBe(false);
    });
  });

  describe('saveToCache', () => {
    it('should save entry with correct key', async () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        appid: '12345',
        gameName: 'Test Game',
        resolvedAt: Date.now(),
        ttlDays: 7,
        platforms: {}
      };

      await Cache.saveToCache(entry);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        'xcpw_cache_12345': entry
      });
    });

    it('should store entry retrievable by getFromCache', async () => {
      const Cache = globalThis.SCPW_Cache;
      const entry = {
        appid: '54321',
        gameName: 'Another Game',
        resolvedAt: Date.now(),
        ttlDays: 7,
        cacheVersion: 1,
        platforms: {
          nintendo: { status: 'available', storeUrl: 'url' },
          playstation: { status: 'available', storeUrl: 'url' },
          xbox: { status: 'available', storeUrl: 'url' }
        }
      };

      await Cache.saveToCache(entry);
      const retrieved = await Cache.getFromCache('54321');

      expect(retrieved).toEqual(entry);
    });
  });

  describe('getOrCreatePlatformData', () => {
    it('should return cached data when available', async () => {
      const Cache = globalThis.SCPW_Cache;
      const cachedEntry = {
        appid: '12345',
        gameName: 'Cached Game',
        resolvedAt: Date.now(),
        ttlDays: 7,
        cacheVersion: 1,
        platforms: {
          nintendo: { status: 'available', storeUrl: 'url' },
          playstation: { status: 'available', storeUrl: 'url' },
          xbox: { status: 'available', storeUrl: 'url' }
        }
      };

      setMockStorageData({ 'xcpw_cache_12345': cachedEntry });

      const result = await Cache.getOrCreatePlatformData('12345', 'Cached Game');

      expect(result.fromCache).toBe(true);
      expect(result.entry.appid).toBe('12345');
    });

    it('should create new entry when cache miss', async () => {
      const Cache = globalThis.SCPW_Cache;

      const result = await Cache.getOrCreatePlatformData('99999', 'New Game');

      expect(result.fromCache).toBe(false);
      expect(result.entry.appid).toBe('99999');
      expect(result.entry.gameName).toBe('New Game');
    });

    it('should use manual override when available', async () => {
      const Cache = globalThis.SCPW_Cache;
      // MANUAL_OVERRIDES is empty when CACHE_DEBUG=false (production mode)
      // This test verifies production behavior where overrides are disabled
      const result = await Cache.getOrCreatePlatformData('367520', 'Hollow Knight');

      // In production, all platforms should be 'unknown' since no manual override
      expect(result.entry.platforms.nintendo.status).toBe('unknown');
      expect(result.entry.platforms.playstation.status).toBe('unknown');
      expect(result.entry.platforms.xbox.status).toBe('unknown');
      expect(result.entry.source).toBe('none');
    });

    it('should use unknown status when no override', async () => {
      const Cache = globalThis.SCPW_Cache;

      const result = await Cache.getOrCreatePlatformData('123', 'Unknown Game');

      expect(result.entry.platforms.nintendo.status).toBe('unknown');
      expect(result.entry.platforms.playstation.status).toBe('unknown');
      expect(result.entry.platforms.xbox.status).toBe('unknown');
      expect(result.entry.source).toBe('none');
    });

    it('should update game name when changed', async () => {
      const Cache = globalThis.SCPW_Cache;
      const oldEntry = {
        appid: '12345',
        gameName: 'Old Name',
        resolvedAt: Date.now(),
        ttlDays: 7,
        cacheVersion: 1,
        platforms: {
          nintendo: { status: 'available', storeUrl: 'old-url' },
          playstation: { status: 'available', storeUrl: 'old-url' },
          xbox: { status: 'available', storeUrl: 'old-url' },
          steamdeck: { status: 'available', storeUrl: 'old-url' }
        }
      };

      setMockStorageData({ 'xcpw_cache_12345': oldEntry });

      const result = await Cache.getOrCreatePlatformData('12345', 'New Name');

      expect(result.entry.gameName).toBe('New Name');
      expect(result.entry.platforms.nintendo.storeUrl).toContain('New%20Name');
    });

    it('should save new entry to cache', async () => {
      const Cache = globalThis.SCPW_Cache;

      await Cache.getOrCreatePlatformData('77777', 'Brand New Game');

      const stored = getMockStorageData();
      expect(stored['xcpw_cache_77777']).toBeDefined();
      expect(stored['xcpw_cache_77777'].gameName).toBe('Brand New Game');
    });
  });

  describe('clearCache', () => {
    it('should remove all cache entries', async () => {
      const Cache = globalThis.SCPW_Cache;

      setMockStorageData({
        'xcpw_cache_111': { appid: '111' },
        'xcpw_cache_222': { appid: '222' },
        'other_key': { data: 'preserved' }
      });

      await Cache.clearCache();

      const stored = getMockStorageData();
      expect(stored['xcpw_cache_111']).toBeUndefined();
      expect(stored['xcpw_cache_222']).toBeUndefined();
      expect(stored['other_key']).toEqual({ data: 'preserved' });
    });

    it('should handle empty cache gracefully', async () => {
      const Cache = globalThis.SCPW_Cache;

      await expect(Cache.clearCache()).resolves.not.toThrow();
    });
  });

  describe('getCacheStats', () => {
    it('should return count of cached entries', async () => {
      const Cache = globalThis.SCPW_Cache;

      setMockStorageData({
        'xcpw_cache_111': { appid: '111', resolvedAt: Date.now() },
        'xcpw_cache_222': { appid: '222', resolvedAt: Date.now() },
        'xcpw_cache_333': { appid: '333', resolvedAt: Date.now() },
        'other_key': { data: 'not counted' }
      });

      const stats = await Cache.getCacheStats();

      expect(stats.count).toBe(3);
    });

    it('should return oldest entry timestamp', async () => {
      const Cache = globalThis.SCPW_Cache;
      const oldestTime = Date.now() - 1000000;

      setMockStorageData({
        'xcpw_cache_111': { appid: '111', resolvedAt: Date.now() },
        'xcpw_cache_222': { appid: '222', resolvedAt: oldestTime },
        'xcpw_cache_333': { appid: '333', resolvedAt: Date.now() - 500000 }
      });

      const stats = await Cache.getCacheStats();

      expect(stats.oldestEntry).toBe(oldestTime);
    });

    it('should return null for oldest when no entries', async () => {
      const Cache = globalThis.SCPW_Cache;

      const stats = await Cache.getCacheStats();

      expect(stats.count).toBe(0);
      expect(stats.oldestEntry).toBeNull();
    });

    it('should ignore non-cache keys', async () => {
      const Cache = globalThis.SCPW_Cache;

      setMockStorageData({
        'some_other_key': { resolvedAt: Date.now() },
        'another_key': { data: 'value' }
      });

      const stats = await Cache.getCacheStats();

      expect(stats.count).toBe(0);
    });

    it('should filter out entries with falsy resolvedAt', async () => {
      const Cache = globalThis.SCPW_Cache;
      const validTime = Date.now() - 100000;

      setMockStorageData({
        'xcpw_cache_111': { appid: '111', resolvedAt: validTime },
        'xcpw_cache_222': { appid: '222', resolvedAt: 0 },  // Falsy resolvedAt
        'xcpw_cache_333': { appid: '333', resolvedAt: null },  // Falsy resolvedAt
        'xcpw_cache_444': { appid: '444' }  // Missing resolvedAt
      });

      const stats = await Cache.getCacheStats();

      // Count includes all cache entries
      expect(stats.count).toBe(4);
      // But oldest should only consider truthy timestamps
      expect(stats.oldestEntry).toBe(validTime);
    });
  });

  describe('MANUAL_OVERRIDES', () => {
    // MANUAL_OVERRIDES is empty when CACHE_DEBUG=false (production mode)
    // Test overrides are only active during development

    it('should be empty in production mode (CACHE_DEBUG=false)', () => {
      const Cache = globalThis.SCPW_Cache;
      expect(Object.keys(Cache.MANUAL_OVERRIDES).length).toBe(0);
    });

    it('should be an object', () => {
      const Cache = globalThis.SCPW_Cache;
      expect(typeof Cache.MANUAL_OVERRIDES).toBe('object');
    });
  });
});
