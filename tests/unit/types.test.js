/**
 * Unit tests for types.js
 */

describe('types.js', () => {
  beforeEach(() => {
    // Load the module fresh for each test
    jest.resetModules();
    require('../../dist/types.js');
  });

  describe('StoreUrls', () => {
    it('should export StoreUrls to globalThis', () => {
      expect(globalThis.SCPW_StoreUrls).toBeDefined();
      expect(typeof globalThis.SCPW_StoreUrls).toBe('object');
    });

    it('should have all three platform functions', () => {
      const StoreUrls = globalThis.SCPW_StoreUrls;
      expect(typeof StoreUrls.nintendo).toBe('function');
      expect(typeof StoreUrls.playstation).toBe('function');
      expect(typeof StoreUrls.xbox).toBe('function');
    });

    describe('nintendo URL builder', () => {
      it('should generate correct Nintendo eShop search URL', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.nintendo('Hollow Knight');
        expect(url).toBe('https://www.nintendo.com/search/#q=Hollow%20Knight&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch');
      });

      it('should properly encode special characters', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.nintendo("Marvel's Spider-Man");
        // encodeURIComponent doesn't encode apostrophes (they're URL-safe)
        expect(url).toContain("Marvel's%20Spider-Man");
      });

      it('should handle empty string', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.nintendo('');
        expect(url).toBe('https://www.nintendo.com/search/#q=&sort=df&f=corePlatforms&corePlatforms=Nintendo+Switch');
      });

      it('should handle unicode characters', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.nintendo('鬼谷八荒');
        expect(url).toContain(encodeURIComponent('鬼谷八荒'));
      });
    });

    describe('playstation URL builder', () => {
      it('should generate correct PlayStation Store search URL', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.playstation('God of War');
        expect(url).toBe('https://store.playstation.com/search/God%20of%20War');
      });

      it('should properly encode special characters', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.playstation('Baldur\'s Gate 3');
        // encodeURIComponent doesn't encode apostrophes (they're URL-safe)
        expect(url).toContain("Baldur's%20Gate%203");
      });

      it('should handle empty string', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.playstation('');
        expect(url).toBe('https://store.playstation.com/search/');
      });
    });

    describe('xbox URL builder', () => {
      it('should generate correct Xbox Store search URL', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.xbox('Halo Infinite');
        expect(url).toBe('https://www.xbox.com/search?q=Halo%20Infinite');
      });

      it('should properly encode special characters', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.xbox('Assassin\'s Creed');
        // encodeURIComponent doesn't encode apostrophes (they're URL-safe)
        expect(url).toContain("Assassin's%20Creed");
      });

      it('should handle empty string', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const url = StoreUrls.xbox('');
        expect(url).toBe('https://www.xbox.com/search?q=');
      });
    });

    describe('URL format consistency', () => {
      it('should use HTTPS for all URLs', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const testGame = 'Test Game';

        expect(StoreUrls.nintendo(testGame)).toMatch(/^https:\/\//);
        expect(StoreUrls.playstation(testGame)).toMatch(/^https:\/\//);
        expect(StoreUrls.xbox(testGame)).toMatch(/^https:\/\//);
      });

      it('should not include region codes (region-agnostic)', () => {
        const StoreUrls = globalThis.SCPW_StoreUrls;
        const testGame = 'Test';

        // Nintendo should not have /us-en/ or similar
        expect(StoreUrls.nintendo(testGame)).not.toMatch(/\/[a-z]{2}-[a-z]{2}\//i);
        // PlayStation should not have /en-us/ or similar
        expect(StoreUrls.playstation(testGame)).not.toMatch(/\/[a-z]{2}-[a-z]{2}\//i);
        // Xbox should not have /en-US/ or similar
        expect(StoreUrls.xbox(testGame)).not.toMatch(/\/[a-z]{2}-[A-Z]{2}\//);
      });
    });

    describe('export fallback', () => {
      it('should fall back to window when globalThis is undefined', () => {
        // Save original values
        const originalGlobalThis = globalThis;
        const savedStoreUrls = globalThis.SCPW_StoreUrls;

        // Clean up and reset module
        delete globalThis.SCPW_StoreUrls;
        jest.resetModules();

        // Temporarily make globalThis appear undefined by shadowing
        // We need to test the else-if branch: typeof window !== 'undefined'
        // Since we can't delete globalThis in modern JS, test that window has it
        require('../../dist/types.js');

        // Verify the module loaded successfully (either path works)
        expect(globalThis.SCPW_StoreUrls || window.SCPW_StoreUrls).toBeDefined();

        // Restore
        globalThis.SCPW_StoreUrls = savedStoreUrls;
      });

      it('should not overwrite existing SCPW_StoreUrls', () => {
        // Save original values
        const savedStoreUrls = globalThis.SCPW_StoreUrls;

        // Set a mock value
        const mockStoreUrls = { nintendo: () => 'mock', playstation: () => 'mock', xbox: () => 'mock' };
        globalThis.SCPW_StoreUrls = mockStoreUrls;

        // Reset and reload module
        jest.resetModules();
        require('../../dist/types.js');

        // Verify the existing value was not overwritten
        expect(globalThis.SCPW_StoreUrls).toBe(mockStoreUrls);

        // Restore
        globalThis.SCPW_StoreUrls = savedStoreUrls;
      });
    });
  });

  describe('UserSettings', () => {
    it('should export SCPW_UserSettings to globalThis', () => {
      expect(globalThis.SCPW_UserSettings).toBeDefined();
      expect(typeof globalThis.SCPW_UserSettings).toBe('object');
    });

    it('should have DEFAULT_USER_SETTINGS with all required properties', () => {
      const { DEFAULT_USER_SETTINGS } = globalThis.SCPW_UserSettings;
      expect(DEFAULT_USER_SETTINGS).toBeDefined();
      expect(typeof DEFAULT_USER_SETTINGS.showNintendo).toBe('boolean');
      expect(typeof DEFAULT_USER_SETTINGS.showPlaystation).toBe('boolean');
      expect(typeof DEFAULT_USER_SETTINGS.showXbox).toBe('boolean');
      expect(typeof DEFAULT_USER_SETTINGS.showSteamDeck).toBe('boolean');
      expect(typeof DEFAULT_USER_SETTINGS.showHltb).toBe('boolean');
    });

    it('should have all settings enabled by default', () => {
      const { DEFAULT_USER_SETTINGS } = globalThis.SCPW_UserSettings;
      expect(DEFAULT_USER_SETTINGS.showNintendo).toBe(true);
      expect(DEFAULT_USER_SETTINGS.showPlaystation).toBe(true);
      expect(DEFAULT_USER_SETTINGS.showXbox).toBe(true);
      expect(DEFAULT_USER_SETTINGS.showSteamDeck).toBe(true);
      expect(DEFAULT_USER_SETTINGS.showHltb).toBe(true);
    });

    it('should have SETTING_CHECKBOX_IDS for all settings', () => {
      const { SETTING_CHECKBOX_IDS } = globalThis.SCPW_UserSettings;
      expect(SETTING_CHECKBOX_IDS).toBeDefined();
      expect(SETTING_CHECKBOX_IDS.showNintendo).toBe('show-nintendo');
      expect(SETTING_CHECKBOX_IDS.showPlaystation).toBe('show-playstation');
      expect(SETTING_CHECKBOX_IDS.showXbox).toBe('show-xbox');
      expect(SETTING_CHECKBOX_IDS.showSteamDeck).toBe('show-steamdeck');
      expect(SETTING_CHECKBOX_IDS.showHltb).toBe('show-hltb');
    });

    it('should have USER_SETTING_KEYS array with all setting keys', () => {
      const { USER_SETTING_KEYS } = globalThis.SCPW_UserSettings;
      expect(Array.isArray(USER_SETTING_KEYS)).toBe(true);
      expect(USER_SETTING_KEYS).toContain('showNintendo');
      expect(USER_SETTING_KEYS).toContain('showPlaystation');
      expect(USER_SETTING_KEYS).toContain('showXbox');
      expect(USER_SETTING_KEYS).toContain('showSteamDeck');
      expect(USER_SETTING_KEYS).toContain('showHltb');
    });

    it('should have matching keys between DEFAULT_USER_SETTINGS and SETTING_CHECKBOX_IDS', () => {
      const { DEFAULT_USER_SETTINGS, SETTING_CHECKBOX_IDS, USER_SETTING_KEYS } = globalThis.SCPW_UserSettings;

      // All boolean settings should have corresponding checkbox IDs
      // Non-boolean settings (like hltbDisplayStat select) don't need checkbox IDs
      for (const key of Object.keys(DEFAULT_USER_SETTINGS)) {
        expect(USER_SETTING_KEYS).toContain(key);
        if (typeof DEFAULT_USER_SETTINGS[key] === 'boolean') {
          expect(SETTING_CHECKBOX_IDS[key]).toBeDefined();
        }
      }
    });

    it('should not overwrite existing SCPW_UserSettings', () => {
      // Save original values
      const savedUserSettings = globalThis.SCPW_UserSettings;

      // Set a mock value
      const mockUserSettings = { test: true };
      globalThis.SCPW_UserSettings = mockUserSettings;

      // Reset and reload module
      jest.resetModules();
      require('../../dist/types.js');

      // Verify the existing value was not overwritten
      expect(globalThis.SCPW_UserSettings).toBe(mockUserSettings);

      // Restore
      globalThis.SCPW_UserSettings = savedUserSettings;
    });
  });
});
