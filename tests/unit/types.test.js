/**
 * Unit tests for types.js
 */

describe('types.js', () => {
  beforeEach(() => {
    // Load the module fresh for each test
    jest.resetModules();
    require('../../src/types.js');
  });

  describe('StoreUrls', () => {
    it('should export StoreUrls to globalThis', () => {
      expect(globalThis.XCPW_StoreUrls).toBeDefined();
      expect(typeof globalThis.XCPW_StoreUrls).toBe('object');
    });

    it('should have all three platform functions', () => {
      const StoreUrls = globalThis.XCPW_StoreUrls;
      expect(typeof StoreUrls.nintendo).toBe('function');
      expect(typeof StoreUrls.playstation).toBe('function');
      expect(typeof StoreUrls.xbox).toBe('function');
    });

    describe('nintendo URL builder', () => {
      it('should generate correct Nintendo eShop search URL', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.nintendo('Hollow Knight');
        expect(url).toBe('https://www.nintendo.com/search/#q=Hollow%20Knight&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch');
      });

      it('should properly encode special characters', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.nintendo("Marvel's Spider-Man");
        // encodeURIComponent doesn't encode apostrophes (they're URL-safe)
        expect(url).toContain("Marvel's%20Spider-Man");
      });

      it('should handle empty string', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.nintendo('');
        expect(url).toBe('https://www.nintendo.com/search/#q=&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch');
      });

      it('should handle unicode characters', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.nintendo('鬼谷八荒');
        expect(url).toContain(encodeURIComponent('鬼谷八荒'));
      });
    });

    describe('playstation URL builder', () => {
      it('should generate correct PlayStation Store search URL', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.playstation('God of War');
        expect(url).toBe('https://store.playstation.com/search/God%20of%20War');
      });

      it('should properly encode special characters', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.playstation('Baldur\'s Gate 3');
        // encodeURIComponent doesn't encode apostrophes (they're URL-safe)
        expect(url).toContain("Baldur's%20Gate%203");
      });

      it('should handle empty string', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.playstation('');
        expect(url).toBe('https://store.playstation.com/search/');
      });
    });

    describe('xbox URL builder', () => {
      it('should generate correct Xbox Store search URL', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.xbox('Halo Infinite');
        expect(url).toBe('https://www.xbox.com/search?q=Halo%20Infinite');
      });

      it('should properly encode special characters', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.xbox('Assassin\'s Creed');
        // encodeURIComponent doesn't encode apostrophes (they're URL-safe)
        expect(url).toContain("Assassin's%20Creed");
      });

      it('should handle empty string', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const url = StoreUrls.xbox('');
        expect(url).toBe('https://www.xbox.com/search?q=');
      });
    });

    describe('URL format consistency', () => {
      it('should use HTTPS for all URLs', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const testGame = 'Test Game';

        expect(StoreUrls.nintendo(testGame)).toMatch(/^https:\/\//);
        expect(StoreUrls.playstation(testGame)).toMatch(/^https:\/\//);
        expect(StoreUrls.xbox(testGame)).toMatch(/^https:\/\//);
      });

      it('should not include region codes (region-agnostic)', () => {
        const StoreUrls = globalThis.XCPW_StoreUrls;
        const testGame = 'Test';

        // Nintendo should not have /us-en/ or similar
        expect(StoreUrls.nintendo(testGame)).not.toMatch(/\/[a-z]{2}-[a-z]{2}\//i);
        // PlayStation should not have /en-us/ or similar
        expect(StoreUrls.playstation(testGame)).not.toMatch(/\/[a-z]{2}-[a-z]{2}\//i);
        // Xbox should not have /en-US/ or similar
        expect(StoreUrls.xbox(testGame)).not.toMatch(/\/[a-z]{2}-[A-Z]{2}\//);
      });
    });
  });
});
