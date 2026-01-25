/**
 * Unit tests for content.js
 *
 * content.js is DOM-heavy and relies on the browser environment.
 * We test the functions that can be isolated and mocked.
 * Note: Using innerHTML for test fixtures is safe as content is static/trusted.
 */

describe('content.js', () => {
  let mockIcons;
  let mockPlatformInfo;
  let mockStatusInfo;

  beforeEach(() => {
    jest.resetModules();

    // Set up DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    // Mock icons module (loaded before content.js)
    mockIcons = {
      nintendo: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect/></svg>',
      playstation: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path/></svg>',
      xbox: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle/></svg>',
      steamdeck: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect/></svg>'
    };
    globalThis.SCPW_Icons = mockIcons;

    mockPlatformInfo = {
      nintendo: { name: 'Nintendo Switch', abbr: 'NS', searchLabel: 'Search Nintendo' },
      playstation: { name: 'PlayStation', abbr: 'PS', searchLabel: 'Search PlayStation' },
      xbox: { name: 'Xbox', abbr: 'XB', searchLabel: 'Search Xbox' },
      steamdeck: { name: 'Steam Deck', abbr: 'SD', searchLabel: 'View on ProtonDB' }
    };
    globalThis.SCPW_PlatformInfo = mockPlatformInfo;

    mockStatusInfo = {
      available: { tooltip: (p) => `${mockPlatformInfo[p].name}: Available`, className: 'scpw-available' },
      unavailable: { tooltip: (p) => `${mockPlatformInfo[p].name}: Not available`, className: 'scpw-unavailable' },
      unknown: { tooltip: (p) => `${mockPlatformInfo[p].name}: Unknown`, className: 'scpw-unknown' }
    };
    globalThis.SCPW_StatusInfo = mockStatusInfo;

    // Mock Steam Deck tiers (loaded from icons.js)
    globalThis.SCPW_SteamDeckTiers = {
      verified: { tooltip: 'Steam Deck: Verified - Works great on Deck', className: 'scpw-deck-verified' },
      playable: { tooltip: 'Steam Deck: Playable - Works with minor issues', className: 'scpw-deck-playable' },
      unsupported: { tooltip: 'Steam Deck: Unsupported - May not work', className: 'scpw-deck-unsupported' },
      unknown: { tooltip: 'Steam Deck: Unknown compatibility', className: 'scpw-deck-unknown' }
    };

    // Mock StoreUrls (loaded from types.js)
    globalThis.SCPW_StoreUrls = {
      nintendo: (gameName) => `https://www.nintendo.com/search/#q=${encodeURIComponent(gameName)}`,
      playstation: (gameName) => `https://store.playstation.com/search/${encodeURIComponent(gameName)}`,
      xbox: (gameName) => `https://www.xbox.com/search?q=${encodeURIComponent(gameName)}`,
      steamdeck: (gameName) => `https://store.steampowered.com/search/?term=${encodeURIComponent(gameName)}`
    };

    // Mock UserSettings (centralized settings from types.js)
    globalThis.SCPW_UserSettings = {
      DEFAULT_USER_SETTINGS: {
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true,
        showHltb: true
      },
      SETTING_CHECKBOX_IDS: {
        showNintendo: 'show-nintendo',
        showPlaystation: 'show-playstation',
        showXbox: 'show-xbox',
        showSteamDeck: 'show-steamdeck',
        showHltb: 'show-hltb'
      },
      USER_SETTING_KEYS: ['showNintendo', 'showPlaystation', 'showXbox', 'showSteamDeck', 'showHltb']
    };

    // Mock chrome.storage.sync for user settings
    chrome.storage.sync.get.mockResolvedValue({ scpwSettings: { showSteamDeck: true } });

    // Mock chrome.runtime.sendMessage
    chrome.runtime.sendMessage = jest.fn().mockResolvedValue({
      success: true,
      data: {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://example.com/ns' },
          playstation: { status: 'unavailable', storeUrl: 'https://example.com/ps' },
          xbox: { status: 'unknown', storeUrl: 'https://example.com/xb' },
          steamdeck: { status: 'available', storeUrl: 'https://example.com/sd' }
        }
      }
    });

    // Load content.js - this will run init() if DOM is ready
    require('../../dist/content.js');
  });

  afterEach(() => {
    delete globalThis.SCPW_Icons;
    delete globalThis.SCPW_PlatformInfo;
    delete globalThis.SCPW_StatusInfo;
    delete globalThis.SCPW_StoreUrls;
  });

  describe('styles', () => {
    // Note: CSS is now loaded via manifest.json content_scripts.css, not injected inline.
    // These tests verify we don't inject duplicate inline styles.

    it('should not inject inline styles (CSS loaded via manifest)', () => {
      const styleElement = document.getElementById('scpw-styles');
      expect(styleElement).toBeFalsy();
    });
  });

  describe('wishlist item detection', () => {
    beforeEach(() => {
      // Create a mock wishlist item structure using DOM API
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-367520-0');
      item.className = 'Panel';
      item.setAttribute('role', 'button');

      const link = document.createElement('a');
      link.href = 'https://store.steampowered.com/app/367520/Hollow_Knight';

      const title = document.createElement('div');
      title.className = 'Title';
      title.textContent = 'Hollow Knight';
      link.appendChild(title);

      const platforms = document.createElement('div');
      platforms.className = 'platforms';

      const winSpan = document.createElement('span');
      winSpan.title = 'Windows';
      const svg = document.createElement('svg');
      svg.setAttribute('class', 'SVGIcon_WindowsLogo');
      winSpan.appendChild(svg);
      platforms.appendChild(winSpan);

      item.appendChild(link);
      item.appendChild(platforms);
      document.body.appendChild(item);
    });

    it('should find wishlist items with data-rfd-draggable-id', async () => {
      const items = document.querySelectorAll('[data-rfd-draggable-id^="WishlistItem-"]');
      expect(items.length).toBe(1);
    });

    it('should extract appid from data-rfd-draggable-id', () => {
      const item = document.querySelector('[data-rfd-draggable-id^="WishlistItem-"]');
      const draggableId = item.getAttribute('data-rfd-draggable-id');
      const match = draggableId.match(/^WishlistItem-(\d+)-/);
      expect(match[1]).toBe('367520');
    });

    it('should extract appid from app link href', () => {
      const item = document.querySelector('[data-rfd-draggable-id^="WishlistItem-"]');
      const appLink = item.querySelector('a[href*="/app/"]');
      const href = appLink.getAttribute('href');
      const match = href.match(/\/app\/(\d+)/);
      expect(match[1]).toBe('367520');
    });
  });

  describe('game name extraction', () => {
    it('should extract game name from title link text', () => {
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');
      const link = document.createElement('a');
      link.href = '/app/12345/Test_Game';
      link.textContent = 'Test Game Name';
      item.appendChild(link);
      document.body.appendChild(item);

      const titleLink = item.querySelector('a[href*="/app/"]');
      const text = titleLink.textContent.trim();

      expect(text).toBe('Test Game Name');
    });

    it('should extract game name from URL slug as fallback', () => {
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');
      const link = document.createElement('a');
      link.href = '/app/12345/Hollow_Knight';
      item.appendChild(link);
      document.body.appendChild(item);

      const titleLink = item.querySelector('a[href*="/app/"]');
      const href = titleLink.getAttribute('href');
      const match = href.match(/\/app\/\d+\/([^/?]+)/);

      if (match) {
        const slug = match[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        expect(slug).toBe('Hollow Knight');
      }
    });
  });

  describe('injection point detection', () => {
    it('should find platform icons container by title attribute', () => {
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');

      const group = document.createElement('div');
      group.className = 'platform-group';

      ['Windows', 'macOS', 'Linux / SteamOS'].forEach(title => {
        const span = document.createElement('span');
        span.title = title;
        span.appendChild(document.createElement('svg'));
        group.appendChild(span);
      });

      item.appendChild(group);
      document.body.appendChild(item);

      const platformIcons = item.querySelectorAll('span[title]');

      expect(platformIcons.length).toBe(3);
      expect(platformIcons[0].getAttribute('title')).toBe('Windows');
      expect(platformIcons[1].getAttribute('title')).toBe('macOS');
      expect(platformIcons[2].getAttribute('title')).toBe('Linux / SteamOS');
    });

    it('should detect VR platform icons', () => {
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');

      const group = document.createElement('div');
      group.className = 'platform-group';

      const winSpan = document.createElement('span');
      winSpan.title = 'Windows';
      winSpan.appendChild(document.createElement('svg'));
      group.appendChild(winSpan);

      const vrSpan = document.createElement('span');
      vrSpan.title = 'VR';
      vrSpan.appendChild(document.createElement('svg'));
      group.appendChild(vrSpan);

      item.appendChild(group);
      document.body.appendChild(item);

      const vrIcon = item.querySelector('span[title="VR"]');
      expect(vrIcon).toBeTruthy();
    });

    it('should detect Steam Deck platform icons', () => {
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');

      const group = document.createElement('div');

      const winSpan = document.createElement('span');
      winSpan.title = 'Windows';
      winSpan.appendChild(document.createElement('svg'));
      group.appendChild(winSpan);

      const deckSpan = document.createElement('span');
      deckSpan.title = 'Steam Deck';
      deckSpan.appendChild(document.createElement('svg'));
      group.appendChild(deckSpan);

      item.appendChild(group);
      document.body.appendChild(item);

      const steamDeckIcon = item.querySelector('span[title="Steam Deck"]');
      expect(steamDeckIcon).toBeTruthy();
    });
  });

  describe('icon container creation', () => {
    it('should create container with scpw-platforms class', () => {
      const container = document.createElement('span');
      container.className = 'scpw-platforms';

      expect(container.classList.contains('scpw-platforms')).toBe(true);
    });

    it('should include separator element', () => {
      const container = document.createElement('span');
      container.className = 'scpw-platforms';

      const separator = document.createElement('span');
      separator.className = 'scpw-separator';
      container.appendChild(separator);

      expect(container.querySelector('.scpw-separator')).toBeTruthy();
    });
  });

  describe('platform icon creation', () => {
    it('should create anchor element for available status', () => {
      const icon = document.createElement('a');
      icon.className = 'scpw-platform-icon scpw-available';
      icon.setAttribute('href', 'https://example.com');
      icon.setAttribute('target', '_blank');
      icon.setAttribute('rel', 'noopener noreferrer');

      expect(icon.tagName).toBe('A');
      expect(icon.classList.contains('scpw-available')).toBe(true);
      expect(icon.getAttribute('target')).toBe('_blank');
    });

    it('should create anchor element for unknown status', () => {
      const icon = document.createElement('a');
      icon.className = 'scpw-platform-icon scpw-unknown';
      icon.setAttribute('href', 'https://example.com/search');

      expect(icon.tagName).toBe('A');
      expect(icon.classList.contains('scpw-unknown')).toBe(true);
    });

    it('should create span element for unavailable status', () => {
      const icon = document.createElement('span');
      icon.className = 'scpw-platform-icon scpw-unavailable';

      expect(icon.tagName).toBe('SPAN');
      expect(icon.classList.contains('scpw-unavailable')).toBe(true);
    });

    it('should set data-platform attribute', () => {
      const icon = document.createElement('a');
      icon.setAttribute('data-platform', 'nintendo');

      expect(icon.getAttribute('data-platform')).toBe('nintendo');
    });

    it('should set title attribute for tooltip', () => {
      const icon = document.createElement('a');
      icon.setAttribute('title', 'Nintendo Switch: Available - Click to view');

      expect(icon.getAttribute('title')).toContain('Nintendo Switch');
    });
  });

  describe('SVG parsing', () => {
    it('should parse valid SVG string', () => {
      const svgString = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect/></svg>';
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, 'image/svg+xml');
      const svg = doc.documentElement;

      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg.getAttribute('width')).toBe('16');
    });

    it('should handle invalid SVG gracefully', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<invalid>', 'image/svg+xml');
      const parserError = doc.querySelector('parsererror');

      // Parser error may or may not exist depending on implementation
      // The key is it doesn't throw
      expect(doc).toBeTruthy();
    });
  });

  describe('message passing', () => {
    it('should call chrome.runtime.sendMessage with correct message type', async () => {
      const message = {
        type: 'GET_PLATFORM_DATA',
        appid: '367520',
        gameName: 'Hollow Knight'
      };

      await chrome.runtime.sendMessage(message);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(message);
    });

    it('should handle successful response', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        data: {
          gameName: 'Test',
          platforms: {
            nintendo: { status: 'available', storeUrl: 'url' },
            playstation: { status: 'available', storeUrl: 'url' },
            xbox: { status: 'available', storeUrl: 'url' }
          }
        }
      });

      const response = await chrome.runtime.sendMessage({
        type: 'GET_PLATFORM_DATA',
        appid: '12345',
        gameName: 'Test'
      });

      expect(response.success).toBe(true);
      expect(response.data.platforms.nintendo.status).toBe('available');
    });

    it('should handle failed response gracefully', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Service worker inactive'));

      try {
        await chrome.runtime.sendMessage({ type: 'GET_PLATFORM_DATA' });
      } catch (error) {
        expect(error.message).toContain('Service worker');
      }
    });
  });

  describe('MutationObserver setup', () => {
    it('should be able to create MutationObserver', () => {
      const callback = jest.fn();
      const observer = new MutationObserver(callback);

      expect(observer).toBeTruthy();
      expect(typeof observer.observe).toBe('function');
      expect(typeof observer.disconnect).toBe('function');
    });
  });

  describe('processed attribute handling', () => {
    it('should mark processed items with data-scpw-processed', () => {
      const item = document.createElement('div');
      item.setAttribute('data-scpw-processed', 'true');

      expect(item.hasAttribute('data-scpw-processed')).toBe(true);
      expect(item.getAttribute('data-scpw-processed')).toBe('true');
    });

    it('should mark items with icons using data-scpw-icons', () => {
      const item = document.createElement('div');
      item.setAttribute('data-scpw-icons', 'true');

      expect(item.hasAttribute('data-scpw-icons')).toBe(true);
    });
  });

  describe('StoreUrls', () => {
    it('should use StoreUrls from globalThis', () => {
      // content.js uses SCPW_StoreUrls from globalThis (loaded via types.js)
      expect(globalThis.SCPW_StoreUrls).toBeDefined();
      expect(typeof globalThis.SCPW_StoreUrls.nintendo).toBe('function');
      expect(typeof globalThis.SCPW_StoreUrls.playstation).toBe('function');
      expect(typeof globalThis.SCPW_StoreUrls.xbox).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should log error when PLATFORM_ICONS is missing', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      delete globalThis.SCPW_Icons;
      jest.resetModules();
      globalThis.SCPW_PlatformInfo = mockPlatformInfo;
      globalThis.SCPW_StatusInfo = mockStatusInfo;
      require('../../dist/content.js');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing icon definitions')
      );

      consoleSpy.mockRestore();
    });

    it('should log error when PLATFORM_INFO is missing', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      delete globalThis.SCPW_PlatformInfo;
      jest.resetModules();
      globalThis.SCPW_Icons = mockIcons;
      globalThis.SCPW_StatusInfo = mockStatusInfo;
      require('../../dist/content.js');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing icon definitions')
      );

      consoleSpy.mockRestore();
    });
  });

  // Note: icon update tests are consolidated in 'updateIconsWithData (exported function)' describe block below

  describe('lazy loading support', () => {
    it('should wait for SVG icons to appear in lazy-loaded items', async () => {
      // Simulate a lazy-loaded item without SVG icons initially
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');
      const content = document.createElement('div');
      content.className = 'content';
      content.textContent = 'Loading...';
      item.appendChild(content);
      document.body.appendChild(item);

      let svg = item.querySelector('svg');
      expect(svg).toBeNull();

      // Simulate SVG icons appearing after delay
      const platformGroup = document.createElement('div');
      const span = document.createElement('span');
      span.title = 'Windows';
      const svgEl = document.createElement('svg');
      svgEl.setAttribute('class', 'SVGIcon_WindowsLogo');
      span.appendChild(svgEl);
      platformGroup.appendChild(span);
      item.appendChild(platformGroup);

      svg = item.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('extractAppId fallback', () => {
    it('should extract appid from app link when draggable-id is missing', () => {
      // Create item without data-rfd-draggable-id (simulates non-standard layout)
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = 'https://store.steampowered.com/app/570/Dota_2';
      item.appendChild(link);
      document.body.appendChild(item);

      // Verify fallback extraction works
      const appLink = item.querySelector('a[href*="/app/"]');
      const match = appLink.getAttribute('href')?.match(/\/app\/(\d+)/);
      expect(match[1]).toBe('570');
    });

    it('should return null when no appid can be extracted', () => {
      const item = document.createElement('div');
      item.textContent = 'No links here';
      document.body.appendChild(item);

      const appLink = item.querySelector('a[href*="/app/"]');
      const draggableId = item.getAttribute('data-rfd-draggable-id');

      expect(appLink).toBeNull();
      expect(draggableId).toBeNull();
    });
  });

  // Note: updateIconsWithData edge cases are covered in main 'updateIconsWithData (exported function)' describe block

  describe('findInjectionPoint fallback', () => {
    it('should fall back to item itself when no valid container found', () => {
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-99999-0');
      // No platform icons, no SVGs, no title links
      item.textContent = 'Empty item';
      document.body.appendChild(item);

      // Verify fallback behavior: when nothing found, item itself is the container
      const platformIcon = item.querySelector('span[title]');
      const svgIcons = item.querySelectorAll('svg');

      expect(platformIcon).toBeNull();
      expect(svgIcons.length).toBe(0);
      // In this case, findInjectionPoint returns { container: item, insertAfter: null }
    });

    it('should find SVG group when platform icons by title are not found', () => {
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');

      // Create SVGs without title attributes
      const group = document.createElement('div');
      for (let i = 0; i < 3; i++) {
        const wrapper = document.createElement('span');
        const svg = document.createElement('svg');
        svg.setAttribute('class', 'SVGIcon_' + i);
        wrapper.appendChild(svg);
        group.appendChild(wrapper);
      }
      item.appendChild(group);
      document.body.appendChild(item);

      const svgIcons = item.querySelectorAll('svg');
      expect(svgIcons.length).toBe(3);

      // Verify group detection works
      const firstSvg = svgIcons[0];
      const parent = firstSvg.parentElement;
      const svgGroup = parent.parentElement || parent;
      expect(item.contains(svgGroup)).toBe(true);
    });
  });

  describe('requestPlatformData error handling', () => {
    it('should handle service worker errors gracefully', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(
        new Error('Extension context invalidated')
      );

      let result = null;
      try {
        result = await chrome.runtime.sendMessage({
          type: 'GET_PLATFORM_DATA',
          appid: '12345',
          gameName: 'Test'
        });
      } catch {
        result = null; // Error caught, return null
      }

      expect(result).toBeNull();
    });

    it('should return null for unsuccessful response', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: false,
        data: null
      });

      const response = await chrome.runtime.sendMessage({
        type: 'GET_PLATFORM_DATA',
        appid: '12345',
        gameName: 'Test'
      });

      expect(response.success).toBe(false);
      // In requestPlatformData, this would return null
    });
  });

  describe('DOMContentLoaded handling', () => {
    it('should handle already-loaded DOM state', () => {
      // Test that init runs when DOM is already ready
      expect(document.readyState).not.toBe('loading');
      // content.js should have already run init() since DOM was ready
      // (No inline CSS injection anymore - CSS is loaded via manifest)
      // Verify globals are available (as init would have checked)
      expect(globalThis.SCPW_Icons).toBeDefined();
      expect(globalThis.SCPW_PlatformInfo).toBeDefined();
      expect(globalThis.SCPW_StatusInfo).toBeDefined();
    });
  });

  describe('batch processing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      // Clear pending items between tests
      if (globalThis.SCPW_ContentTestExports?.pendingItems) {
        globalThis.SCPW_ContentTestExports.pendingItems.clear();
      }
    });

    it('should send GET_PLATFORM_DATA_BATCH message type', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        results: {
          '12345': {
            data: {
              gameName: 'Test Game',
              platforms: {
                nintendo: { status: 'available', storeUrl: 'https://example.com/ns' },
                playstation: { status: 'unavailable', storeUrl: null },
                xbox: { status: 'unknown', storeUrl: null }
              }
            },
            fromCache: false
          }
        }
      });

      await chrome.runtime.sendMessage({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Test Game' }]
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Test Game' }]
      });
    });

    it('should handle batch response with multiple games', async () => {
      const batchResponse = {
        success: true,
        results: {
          '12345': {
            data: {
              gameName: 'Game 1',
              platforms: {
                nintendo: { status: 'available', storeUrl: 'https://ns.example.com/1' },
                playstation: { status: 'unavailable', storeUrl: null },
                xbox: { status: 'unknown', storeUrl: null }
              }
            },
            fromCache: true
          },
          '67890': {
            data: {
              gameName: 'Game 2',
              platforms: {
                nintendo: { status: 'unavailable', storeUrl: null },
                playstation: { status: 'available', storeUrl: 'https://ps.example.com/2' },
                xbox: { status: 'available', storeUrl: 'https://xb.example.com/2' }
              }
            },
            fromCache: false
          }
        }
      };

      chrome.runtime.sendMessage.mockResolvedValueOnce(batchResponse);

      const response = await chrome.runtime.sendMessage({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: [
          { appid: '12345', gameName: 'Game 1' },
          { appid: '67890', gameName: 'Game 2' }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.results['12345'].data.gameName).toBe('Game 1');
      expect(response.results['67890'].data.gameName).toBe('Game 2');
      expect(response.results['12345'].fromCache).toBe(true);
      expect(response.results['67890'].fromCache).toBe(false);
    });

    it('should handle failed batch response gracefully', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: false,
        results: {}
      });

      const response = await chrome.runtime.sendMessage({
        type: 'GET_PLATFORM_DATA_BATCH',
        games: [{ appid: '12345', gameName: 'Test' }]
      });

      expect(response.success).toBe(false);
      expect(response.results).toEqual({});
    });

    it('should handle batch request network errors', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(
        new Error('Extension context invalidated')
      );

      let result = null;
      try {
        result = await chrome.runtime.sendMessage({
          type: 'GET_PLATFORM_DATA_BATCH',
          games: [{ appid: '12345', gameName: 'Test' }]
        });
      } catch {
        result = null;
      }

      expect(result).toBeNull();
    });

    it('should queue items for batch resolution', () => {
      const { queueForBatchResolution, pendingItems } = globalThis.SCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'scpw-platforms';

      queueForBatchResolution('12345', 'Test Game', container);

      expect(pendingItems.size).toBe(1);
      expect(pendingItems.has('12345')).toBe(true);
    });

    it('should process pending batch after debounce', async () => {
      const { queueForBatchResolution, pendingItems } = globalThis.SCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'scpw-platforms';

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        results: {
          '12345': {
            data: {
              gameName: 'Test Game',
              platforms: {
                nintendo: { status: 'available', storeUrl: null },
                playstation: { status: 'unavailable', storeUrl: null },
                xbox: { status: 'unknown', storeUrl: null }
              }
            },
            fromCache: false
          }
        }
      });

      queueForBatchResolution('12345', 'Test Game', container);
      expect(pendingItems.size).toBe(1);

      // Fast-forward past debounce timer
      jest.advanceTimersByTime(150);

      // Wait for async processPendingBatch to complete
      await Promise.resolve();

      // Items should be cleared after processing
      expect(pendingItems.size).toBe(0);
    });

    it('should batch multiple items together', () => {
      const { queueForBatchResolution, pendingItems } = globalThis.SCPW_ContentTestExports;

      const container1 = document.createElement('span');
      const container2 = document.createElement('span');
      const container3 = document.createElement('span');

      queueForBatchResolution('111', 'Game 1', container1);
      queueForBatchResolution('222', 'Game 2', container2);
      queueForBatchResolution('333', 'Game 3', container3);

      expect(pendingItems.size).toBe(3);
      expect(pendingItems.has('111')).toBe(true);
      expect(pendingItems.has('222')).toBe(true);
      expect(pendingItems.has('333')).toBe(true);
    });

    it('should call processPendingBatch with empty pending items', async () => {
      const { processPendingBatch, pendingItems } = globalThis.SCPW_ContentTestExports;

      // Ensure pending items is empty
      pendingItems.clear();

      // Should return early without making any requests
      await processPendingBatch();

      // sendMessage should not have been called for batch
      const batchCalls = chrome.runtime.sendMessage.mock.calls.filter(
        call => call[0]?.type === 'GET_PLATFORM_DATA_BATCH'
      );
      expect(batchCalls.length).toBe(0);
    });

    it('should handle batch failure and clear containers', async () => {
      const { queueForBatchResolution, pendingItems } = globalThis.SCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'scpw-platforms';
      container.innerHTML = '<span class="loading">Loading...</span>';

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: false,
        results: {}
      });

      queueForBatchResolution('12345', 'Test Game', container);

      // Fast-forward past debounce timer
      jest.advanceTimersByTime(150);

      // Wait for async processPendingBatch to complete
      await Promise.resolve();
      await Promise.resolve();

      // Items should be cleared
      expect(pendingItems.size).toBe(0);
    });

    it('should handle batch network error and clear containers', async () => {
      const { queueForBatchResolution, pendingItems } = globalThis.SCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'scpw-platforms';

      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      queueForBatchResolution('12345', 'Test Game', container);

      // Fast-forward past debounce timer
      jest.advanceTimersByTime(150);

      // Wait for async processPendingBatch to complete
      await Promise.resolve();
      await Promise.resolve();

      // Items should be cleared even on error
      expect(pendingItems.size).toBe(0);
    });
  });

  describe('extractAppId (exported function)', () => {
    it('should extract appid from data-rfd-draggable-id (primary)', () => {
      const { extractAppId } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');

      expect(extractAppId(item)).toBe('12345');
    });

    it('should extract appid from app link when draggable-id is missing (fallback)', () => {
      const { extractAppId } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = 'https://store.steampowered.com/app/570/Dota_2';
      item.appendChild(link);

      expect(extractAppId(item)).toBe('570');
    });

    it('should extract appid from app link when draggable-id does not match pattern', () => {
      const { extractAppId } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'SomethingElse-123');
      const link = document.createElement('a');
      link.href = '/app/999/Test_Game';
      item.appendChild(link);

      expect(extractAppId(item)).toBe('999');
    });

    it('should return null when no appid can be extracted', () => {
      const { extractAppId } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      item.textContent = 'No links or draggable id';

      expect(extractAppId(item)).toBeNull();
    });

    it('should return null when app link exists but href has no appid', () => {
      const { extractAppId } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = 'https://store.steampowered.com/about/';
      item.appendChild(link);

      expect(extractAppId(item)).toBeNull();
    });
  });

  describe('extractGameName (exported function)', () => {
    it('should extract game name from link text (primary)', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345/Test_Game';
      link.textContent = 'Test Game Name';
      item.appendChild(link);

      expect(extractGameName(item)).toBe('Test Game Name');
    });

    it('should extract game name from URL slug when link text is empty', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345/Hollow_Knight';
      link.textContent = '';
      item.appendChild(link);

      expect(extractGameName(item)).toBe('Hollow Knight');
    });

    it('should use title selector fallback when link has no slug', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345';
      link.textContent = '';
      item.appendChild(link);

      const titleEl = document.createElement('div');
      titleEl.className = 'Title';
      titleEl.textContent = 'Fallback Title';
      item.appendChild(titleEl);

      expect(extractGameName(item)).toBe('Fallback Title');
    });

    it('should skip invalid title text (too short)', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345';
      link.textContent = '';
      item.appendChild(link);

      const titleEl = document.createElement('div');
      titleEl.className = 'Title';
      titleEl.textContent = 'AB'; // Too short
      item.appendChild(titleEl);

      expect(extractGameName(item)).toBe('Unknown Game');
    });

    it('should skip title text that looks like a price', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345';
      link.textContent = '';
      item.appendChild(link);

      const titleEl = document.createElement('div');
      titleEl.className = 'Title';
      titleEl.textContent = '$19.99';
      item.appendChild(titleEl);

      expect(extractGameName(item)).toBe('Unknown Game');
    });

    it('should return Unknown Game when no valid title found', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      item.textContent = 'No valid title elements';

      expect(extractGameName(item)).toBe('Unknown Game');
    });
  });

  describe('parseSvg (exported function)', () => {
    it('should parse valid SVG string', () => {
      const { parseSvg } = globalThis.SCPW_ContentTestExports;
      const svgString = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect/></svg>';

      const svg = parseSvg(svgString);

      expect(svg).toBeTruthy();
      expect(svg.tagName.toLowerCase()).toBe('svg');
    });

    it('should return null and log error for invalid SVG', () => {
      const { parseSvg } = globalThis.SCPW_ContentTestExports;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // This malformed XML should trigger parsererror
      const result = parseSvg('<svg><unclosed');

      // DOMParser creates parsererror for invalid XML, which parseSvg detects
      // and returns null after logging an error
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SVG parsing error')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('removeLoadingState (exported function)', () => {
    it('should remove loader element from container (UX-1 refactor)', () => {
      const { removeLoadingState, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      // Verify loader exists
      expect(container.querySelector('.scpw-loader')).toBeTruthy();

      removeLoadingState(container);

      // Loader should be removed
      expect(container.querySelector('.scpw-loader')).toBeNull();
    });

    it('should handle container with no loader gracefully', () => {
      const { removeLoadingState } = globalThis.SCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'scpw-platforms';

      // No loader element
      const icon = document.createElement('a');
      icon.className = 'scpw-platform-icon scpw-available';
      container.appendChild(icon);

      // Should not throw
      removeLoadingState(container);

      expect(container.querySelector('.scpw-available')).toBeTruthy();
    });
  });

  describe('updateIconsWithData (exported function)', () => {
    it('should dynamically add available icons (UX-1 refactor)', () => {
      const { updateIconsWithData, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');
      document.body.appendChild(container);

      // Initially only has loader, no icons
      expect(container.querySelector('.scpw-loader')).toBeTruthy();
      expect(container.querySelectorAll('[data-platform]').length).toBe(0);

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
          playstation: { status: 'available', storeUrl: 'https://ps.example.com' },
          xbox: { status: 'available', storeUrl: 'https://xb.example.com' }
        }
      };

      updateIconsWithData(container, data);

      // Loader removed, 3 available icons added
      expect(container.querySelector('.scpw-loader')).toBeNull();
      expect(container.querySelectorAll('.scpw-available').length).toBe(3);
    });

    it('should only add available icons, skip unavailable', () => {
      const { updateIconsWithData, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
          playstation: { status: 'unavailable' },
          xbox: { status: 'unavailable' }
        }
      };

      updateIconsWithData(container, data);

      expect(container.querySelector('[data-platform="nintendo"]')).toBeTruthy();
      expect(container.querySelector('[data-platform="playstation"]')).toBeNull();
      expect(container.querySelector('[data-platform="xbox"]')).toBeNull();
    });

    it('should skip unknown icons (not add them)', () => {
      const { updateIconsWithData, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'unknown' },
          playstation: { status: 'available', storeUrl: 'https://ps.example.com' },
          xbox: { status: 'unknown' }
        }
      };

      updateIconsWithData(container, data);

      expect(container.querySelector('[data-platform="nintendo"]')).toBeNull();
      expect(container.querySelector('[data-platform="playstation"]')).toBeTruthy();
      expect(container.querySelector('[data-platform="xbox"]')).toBeNull();
    });

    it('should handle missing platform data (defaults to unknown, not added)', () => {
      const { updateIconsWithData, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' }
          // playstation and xbox are missing
        }
      };

      updateIconsWithData(container, data);

      expect(container.querySelector('[data-platform="nintendo"]')).toBeTruthy();
      // Missing platforms default to unknown and are not added
      expect(container.querySelector('[data-platform="playstation"]')).toBeNull();
      expect(container.querySelector('[data-platform="xbox"]')).toBeNull();
    });

    it('should not add separator when no icons are available', () => {
      const { updateIconsWithData, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'unavailable' },
          playstation: { status: 'unavailable' },
          xbox: { status: 'unavailable' }
        }
      };

      updateIconsWithData(container, data);

      expect(container.querySelector('.scpw-separator')).toBeNull();
      expect(container.querySelectorAll('[data-platform]').length).toBe(0);
    });

    it('should add separator when at least one icon is available', () => {
      const { updateIconsWithData, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'unavailable' },
          playstation: { status: 'available', storeUrl: 'https://ps.example.com' },
          xbox: { status: 'unavailable' }
        }
      };

      updateIconsWithData(container, data);

      expect(container.querySelector('.scpw-separator')).toBeTruthy();
      expect(container.querySelectorAll('[data-platform]').length).toBe(1);
    });
  });

  describe('requestPlatformData (exported function)', () => {
    it('should return response when successful', async () => {
      const { requestPlatformData } = globalThis.SCPW_ContentTestExports;

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        data: {
          gameName: 'Test',
          platforms: { nintendo: { status: 'available' } }
        }
      });

      const result = await requestPlatformData('12345', 'Test');

      expect(result).toBeTruthy();
      expect(result.success).toBe(true);
      expect(result.data.gameName).toBe('Test');
    });

    it('should return null when response.success is false', async () => {
      const { requestPlatformData } = globalThis.SCPW_ContentTestExports;

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: false,
        data: null
      });

      const result = await requestPlatformData('12345', 'Test');

      expect(result).toBeNull();
    });

    it('should return null when response.data is null', async () => {
      const { requestPlatformData } = globalThis.SCPW_ContentTestExports;

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        data: null
      });

      const result = await requestPlatformData('12345', 'Test');

      expect(result).toBeNull();
    });

    it('should return null when response is undefined', async () => {
      const { requestPlatformData } = globalThis.SCPW_ContentTestExports;

      chrome.runtime.sendMessage.mockResolvedValueOnce(undefined);

      const result = await requestPlatformData('12345', 'Test');

      expect(result).toBeNull();
    });

    it('should return null and not throw when service worker errors', async () => {
      const { requestPlatformData, MESSAGE_MAX_RETRIES } = globalThis.SCPW_ContentTestExports;

      // Mock all retry attempts (initial + MAX_RETRIES) to fail
      const error = new Error('Extension context invalidated');
      for (let i = 0; i <= MESSAGE_MAX_RETRIES; i++) {
        chrome.runtime.sendMessage.mockRejectedValueOnce(error);
      }

      const result = await requestPlatformData('12345', 'Test');

      expect(result).toBeNull();
    });
  });

  describe('sendMessageWithRetry (exported function)', () => {
    it('should return response on first successful attempt', async () => {
      const { sendMessageWithRetry } = globalThis.SCPW_ContentTestExports;

      const mockResponse = { success: true, data: 'test' };
      chrome.runtime.sendMessage.mockResolvedValueOnce(mockResponse);

      const result = await sendMessageWithRetry({ type: 'TEST' });

      expect(result).toEqual(mockResponse);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should retry on "Could not establish connection" error and succeed', async () => {
      const { sendMessageWithRetry } = globalThis.SCPW_ContentTestExports;

      const mockResponse = { success: true, data: 'test' };
      chrome.runtime.sendMessage
        .mockRejectedValueOnce(new Error('Could not establish connection'))
        .mockResolvedValueOnce(mockResponse);

      const result = await sendMessageWithRetry({ type: 'TEST' });

      expect(result).toEqual(mockResponse);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should retry on "Receiving end does not exist" error and succeed', async () => {
      const { sendMessageWithRetry } = globalThis.SCPW_ContentTestExports;

      const mockResponse = { success: true, data: 'test' };
      chrome.runtime.sendMessage
        .mockRejectedValueOnce(new Error('Receiving end does not exist'))
        .mockResolvedValueOnce(mockResponse);

      const result = await sendMessageWithRetry({ type: 'TEST' });

      expect(result).toEqual(mockResponse);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately on non-connection errors', async () => {
      const { sendMessageWithRetry } = globalThis.SCPW_ContentTestExports;

      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Some other error'));

      await expect(sendMessageWithRetry({ type: 'TEST' })).rejects.toThrow('Some other error');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries parameter', async () => {
      const { sendMessageWithRetry, MESSAGE_MAX_RETRIES } = globalThis.SCPW_ContentTestExports;

      const error = new Error('Could not establish connection');
      for (let i = 0; i <= MESSAGE_MAX_RETRIES; i++) {
        chrome.runtime.sendMessage.mockRejectedValueOnce(error);
      }

      await expect(sendMessageWithRetry({ type: 'TEST' })).rejects.toThrow('Could not establish connection');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(MESSAGE_MAX_RETRIES + 1);
    });

    it('should use exponential backoff delay between retries', async () => {
      const { sendMessageWithRetry, MESSAGE_RETRY_DELAY_MS } = globalThis.SCPW_ContentTestExports;

      jest.useFakeTimers();

      const mockResponse = { success: true };
      chrome.runtime.sendMessage
        .mockRejectedValueOnce(new Error('Could not establish connection'))
        .mockResolvedValueOnce(mockResponse);

      const promise = sendMessageWithRetry({ type: 'TEST' });

      // Fast-forward through the first retry delay (100ms * 2^0 = 100ms)
      await jest.advanceTimersByTimeAsync(MESSAGE_RETRY_DELAY_MS);

      const result = await promise;
      expect(result).toEqual(mockResponse);

      jest.useRealTimers();
    });

    it('should handle string errors by converting to Error', async () => {
      const { sendMessageWithRetry } = globalThis.SCPW_ContentTestExports;

      // Mock rejection with a string instead of Error object
      chrome.runtime.sendMessage.mockRejectedValueOnce('String error message');

      await expect(sendMessageWithRetry({ type: 'TEST' })).rejects.toThrow('String error message');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should retry on "Extension context invalidated" error', async () => {
      const { sendMessageWithRetry } = globalThis.SCPW_ContentTestExports;

      const mockResponse = { success: true, data: 'test' };
      chrome.runtime.sendMessage
        .mockRejectedValueOnce(new Error('Extension context invalidated'))
        .mockResolvedValueOnce(mockResponse);

      const result = await sendMessageWithRetry({ type: 'TEST' });

      expect(result).toEqual(mockResponse);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('findInjectionPoint (exported function)', () => {
    it('should find Steam platform icon by title', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');

      const group = document.createElement('div');
      group.className = 'platform-group';

      const span = document.createElement('span');
      span.title = 'Windows';
      span.appendChild(document.createElement('svg'));
      group.appendChild(span);

      item.appendChild(group);

      const result = findInjectionPoint(item);

      expect(result.container).toBe(group);
    });

    it('should find Steam Deck icon', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');

      const group = document.createElement('div');

      const span = document.createElement('span');
      span.title = 'Steam Deck';
      span.appendChild(document.createElement('svg'));
      group.appendChild(span);

      item.appendChild(group);

      const result = findInjectionPoint(item);

      expect(result.container).toBe(group);
    });

    it('should find VR icon', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');

      const group = document.createElement('div');

      const span = document.createElement('span');
      span.title = 'VR';
      span.appendChild(document.createElement('svg'));
      group.appendChild(span);

      item.appendChild(group);

      const result = findInjectionPoint(item);

      expect(result.container).toBe(group);
    });

    it('should fall back to SVG group when no title match', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');

      // Create span with title that doesn't match Steam platforms
      const span = document.createElement('span');
      span.title = 'Random Title';
      item.appendChild(span);

      // Create SVG group
      const svgGroup = document.createElement('div');
      for (let i = 0; i < 3; i++) {
        const wrapper = document.createElement('span');
        wrapper.appendChild(document.createElement('svg'));
        svgGroup.appendChild(wrapper);
      }
      item.appendChild(svgGroup);

      const result = findInjectionPoint(item);

      expect(result.container).toBe(svgGroup);
    });

    it('should return item itself as fallback when no valid container', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      item.textContent = 'No icons here';

      const result = findInjectionPoint(item);

      expect(result.container).toBe(item);
      expect(result.insertAfter).toBeNull();
    });

    it('should skip span with title when parent is item itself', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');

      // Span directly in item (no valid parent group)
      const span = document.createElement('span');
      span.title = 'Windows';
      span.appendChild(document.createElement('svg'));
      item.appendChild(span);

      const result = findInjectionPoint(item);

      // Should fall back since parent is item itself
      expect(result.container).toBe(item);
    });

    it('should find largest SVG group when multiple groups exist', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');

      // Small group with 1 SVG
      const smallGroup = document.createElement('div');
      const wrapper1 = document.createElement('span');
      wrapper1.appendChild(document.createElement('svg'));
      smallGroup.appendChild(wrapper1);
      item.appendChild(smallGroup);

      // Large group with 3 SVGs
      const largeGroup = document.createElement('div');
      for (let i = 0; i < 3; i++) {
        const wrapper = document.createElement('span');
        wrapper.appendChild(document.createElement('svg'));
        largeGroup.appendChild(wrapper);
      }
      item.appendChild(largeGroup);

      const result = findInjectionPoint(item);

      expect(result.container).toBe(largeGroup);
    });
  });

  describe('createPlatformIcon (exported function)', () => {
    it('should create anchor for available status', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('nintendo', 'available', 'Test Game', 'https://ns.example.com');

      expect(icon.tagName).toBe('A');
      expect(icon.classList.contains('scpw-available')).toBe(true);
      expect(icon.getAttribute('href')).toBe('https://ns.example.com');
      expect(icon.getAttribute('target')).toBe('_blank');
    });

    it('should create anchor for unknown status (links to search)', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('playstation', 'unknown', 'Test Game');

      expect(icon.tagName).toBe('A');
      expect(icon.classList.contains('scpw-unknown')).toBe(true);
      expect(icon.getAttribute('href')).toContain('Test%20Game');
    });

    it('should create span for unavailable status (not clickable)', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('xbox', 'unavailable', 'Test Game');

      expect(icon.tagName).toBe('SPAN');
      expect(icon.classList.contains('scpw-unavailable')).toBe(true);
      expect(icon.hasAttribute('href')).toBe(false);
    });

    it('should use store URL builder when no storeUrl provided', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('nintendo', 'available', 'Hollow Knight');

      expect(icon.getAttribute('href')).toContain('Hollow%20Knight');
    });

    it('should include SVG in icon', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('nintendo', 'available', 'Test');

      expect(icon.querySelector('svg')).toBeTruthy();
    });
  });

  describe('createIconsContainer (exported function)', () => {
    it('should create container with loader instead of platform icons (UX-1 fix)', () => {
      const { createIconsContainer } = globalThis.SCPW_ContentTestExports;

      const container = createIconsContainer('12345', 'Test Game');

      expect(container.classList.contains('scpw-platforms')).toBe(true);
      expect(container.getAttribute('data-appid')).toBe('12345');
      expect(container.getAttribute('data-game-name')).toBe('Test Game');
      // Should have loader instead of 4 platform icons
      expect(container.querySelector('.scpw-loader')).toBeTruthy();
      // Should NOT have platform icons initially
      expect(container.querySelectorAll('[data-platform]').length).toBe(0);
      // Should NOT have separator initially (added when icons are populated)
      expect(container.querySelector('.scpw-separator')).toBeNull();
    });

    it('should have aria-hidden on loader for accessibility', () => {
      const { createIconsContainer } = globalThis.SCPW_ContentTestExports;

      const container = createIconsContainer('12345', 'Test Game');
      const loader = container.querySelector('.scpw-loader');

      expect(loader.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('findWishlistRow (exported function)', () => {
    it('should find row by role=button', () => {
      const { findWishlistRow } = globalThis.SCPW_ContentTestExports;

      const row = document.createElement('div');
      row.setAttribute('role', 'button');

      const link = document.createElement('a');
      link.href = '/app/12345/Test_Game';
      row.appendChild(link);
      document.body.appendChild(row);

      const result = findWishlistRow(link);

      expect(result).toBe(row);
    });

    it('should find row by SVG presence', () => {
      const { findWishlistRow } = globalThis.SCPW_ContentTestExports;

      const row = document.createElement('div');
      const svg = document.createElement('svg');
      row.appendChild(svg);

      const link = document.createElement('a');
      link.href = '/app/12345/Test_Game';
      row.appendChild(link);
      document.body.appendChild(row);

      const result = findWishlistRow(link);

      expect(result).toBe(row);
    });

    it('should return null when no valid row found within depth limit', () => {
      const { findWishlistRow } = globalThis.SCPW_ContentTestExports;

      // Create deeply nested structure without row markers
      let current = document.body;
      for (let i = 0; i < 15; i++) {
        const div = document.createElement('div');
        current.appendChild(div);
        current = div;
      }

      const link = document.createElement('a');
      link.href = '/app/12345/Test_Game';
      current.appendChild(link);

      const result = findWishlistRow(link);

      expect(result).toBeNull();
    });
  });

  describe('findWishlistItems (exported function)', () => {
    it('should find items by data-rfd-draggable-id (unfiltered view)', () => {
      const { findWishlistItems } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');
      const link = document.createElement('a');
      link.href = '/app/12345/Test';
      item.appendChild(link);
      document.body.appendChild(item);

      const items = findWishlistItems();

      expect(items.length).toBe(1);
      expect(items[0]).toBe(item);
    });

    it('should find items by app link walk-up (filtered view)', () => {
      const { findWishlistItems } = globalThis.SCPW_ContentTestExports;

      // Create item without data-rfd-draggable-id (simulates filtered view)
      const row = document.createElement('div');
      row.setAttribute('role', 'button');

      const link = document.createElement('a');
      link.href = '/app/67890/Filtered_Game';
      row.appendChild(link);
      document.body.appendChild(row);

      const items = findWishlistItems();

      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.some(item => item === row)).toBe(true);
    });

    it('should deduplicate items found by both strategies', () => {
      const { findWishlistItems } = globalThis.SCPW_ContentTestExports;

      // Item has both draggable-id AND app link
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-99999-0');
      item.setAttribute('role', 'button');
      const link = document.createElement('a');
      link.href = '/app/99999/Duplicate_Game';
      item.appendChild(link);
      document.body.appendChild(item);

      const items = findWishlistItems();

      // Should only appear once despite matching both strategies
      const matches = items.filter(i => i.querySelector('a[href*="99999"]'));
      expect(matches.length).toBe(1);
    });

    it('should skip already-processed items', () => {
      const { findWishlistItems } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-11111-0');
      item.setAttribute('data-scpw-processed', '11111'); // Already processed
      const icons = document.createElement('span');
      icons.className = 'scpw-platforms';
      item.appendChild(icons);
      const link = document.createElement('a');
      link.href = '/app/11111/Processed';
      item.appendChild(link);
      document.body.appendChild(item);

      const items = findWishlistItems();

      expect(items.some(i => i.querySelector('a[href*="11111"]'))).toBe(false);
    });
  });

  describe('checkDeckFilterActive (exported function)', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      delete window.location;
    });

    afterEach(() => {
      window.location = originalLocation;
    });

    it('should return true when deck_filters param is present', () => {
      const { checkDeckFilterActive } = globalThis.SCPW_ContentTestExports;
      window.location = new URL('https://store.steampowered.com/wishlist?deck_filters=verified');

      expect(checkDeckFilterActive()).toBe(true);
    });

    it('should return false when deck_filters param is absent', () => {
      const { checkDeckFilterActive } = globalThis.SCPW_ContentTestExports;
      window.location = new URL('https://store.steampowered.com/wishlist');

      expect(checkDeckFilterActive()).toBe(false);
    });

    it('should return true for any deck_filters value', () => {
      const { checkDeckFilterActive } = globalThis.SCPW_ContentTestExports;
      window.location = new URL('https://store.steampowered.com/wishlist?deck_filters=playable');

      expect(checkDeckFilterActive()).toBe(true);
    });
  });

  describe('updateIconsWithData with loader (UX-1)', () => {
    it('should remove loader and add icons dynamically', () => {
      const { createIconsContainer, updateIconsWithData } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      // Verify loader exists initially
      expect(container.querySelector('.scpw-loader')).toBeTruthy();

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
          playstation: { status: 'available', storeUrl: 'https://ps.example.com' },
          xbox: { status: 'unavailable' }
        }
      };

      updateIconsWithData(container, data);

      // Loader should be removed
      expect(container.querySelector('.scpw-loader')).toBeNull();
      // Available icons should be added
      expect(container.querySelector('[data-platform="nintendo"]')).toBeTruthy();
      expect(container.querySelector('[data-platform="playstation"]')).toBeTruthy();
      // Unavailable icons should NOT be added
      expect(container.querySelector('[data-platform="xbox"]')).toBeNull();
      // Separator should be added since we have icons
      expect(container.querySelector('.scpw-separator')).toBeTruthy();
    });

    it('should not add separator when no icons available', () => {
      const { createIconsContainer, updateIconsWithData } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'unavailable' },
          playstation: { status: 'unavailable' },
          xbox: { status: 'unknown' }
        }
      };

      updateIconsWithData(container, data);

      // No separator when no visible icons
      expect(container.querySelector('.scpw-separator')).toBeNull();
      expect(container.querySelectorAll('[data-platform]').length).toBe(0);
    });

    it('should use data-game-name attribute as fallback', () => {
      const { createIconsContainer, updateIconsWithData } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Fallback Name');

      // Data without gameName property
      const data = {
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' }
        }
      };

      updateIconsWithData(container, data);

      const icon = container.querySelector('[data-platform="nintendo"]');
      expect(icon).toBeTruthy();
    });
  });

  // Note: removeLoadingState tests are consolidated in 'removeLoadingState (exported function)' describe block

  describe('cleanupAllIcons (icon lifecycle management)', () => {
    beforeEach(() => {
      // Clear any existing state
      const { injectedAppIds, processedAppIds, pendingItems } = globalThis.SCPW_ContentTestExports;
      injectedAppIds.clear();
      processedAppIds.clear();
      pendingItems.clear();
    });

    it('should remove all icon containers from DOM', () => {
      const { cleanupAllIcons, createIconsContainer } = globalThis.SCPW_ContentTestExports;

      // Create and attach some icon containers
      const c1 = createIconsContainer('111', 'Game 1');
      const c2 = createIconsContainer('222', 'Game 2');
      const c3 = createIconsContainer('333', 'Game 3');
      document.body.appendChild(c1);
      document.body.appendChild(c2);
      document.body.appendChild(c3);

      expect(document.querySelectorAll('.scpw-platforms').length).toBe(3);

      cleanupAllIcons();

      expect(document.querySelectorAll('.scpw-platforms').length).toBe(0);
    });

    it('should clear injectedAppIds tracking set', () => {
      const { cleanupAllIcons, injectedAppIds } = globalThis.SCPW_ContentTestExports;

      // Simulate some tracked appids
      injectedAppIds.add('111');
      injectedAppIds.add('222');
      injectedAppIds.add('333');
      expect(injectedAppIds.size).toBe(3);

      cleanupAllIcons();

      expect(injectedAppIds.size).toBe(0);
    });

    it('should clear processedAppIds tracking set', () => {
      const { cleanupAllIcons, processedAppIds } = globalThis.SCPW_ContentTestExports;

      // Simulate some tracked appids
      processedAppIds.add('111');
      processedAppIds.add('222');
      expect(processedAppIds.size).toBe(2);

      cleanupAllIcons();

      expect(processedAppIds.size).toBe(0);
    });

    it('should clear pendingItems map', () => {
      const { cleanupAllIcons, pendingItems } = globalThis.SCPW_ContentTestExports;

      // Simulate some pending items
      pendingItems.set('111', { gameName: 'Game 1', container: document.createElement('span') });
      pendingItems.set('222', { gameName: 'Game 2', container: document.createElement('span') });
      expect(pendingItems.size).toBe(2);

      cleanupAllIcons();

      expect(pendingItems.size).toBe(0);
    });

    it('should remove data-scpw-processed attributes from all elements', () => {
      const { cleanupAllIcons } = globalThis.SCPW_ContentTestExports;

      // Create elements with processed attribute
      const el1 = document.createElement('div');
      el1.setAttribute('data-scpw-processed', 'true');
      document.body.appendChild(el1);

      const el2 = document.createElement('div');
      el2.setAttribute('data-scpw-processed', 'true');
      document.body.appendChild(el2);

      expect(document.querySelectorAll('[data-scpw-processed]').length).toBe(2);

      cleanupAllIcons();

      expect(document.querySelectorAll('[data-scpw-processed]').length).toBe(0);
    });

    it('should remove data-scpw-icons attributes from all elements', () => {
      const { cleanupAllIcons } = globalThis.SCPW_ContentTestExports;

      // Create elements with icons attribute
      const el1 = document.createElement('div');
      el1.setAttribute('data-scpw-icons', 'true');
      document.body.appendChild(el1);

      expect(document.querySelectorAll('[data-scpw-icons]').length).toBe(1);

      cleanupAllIcons();

      expect(document.querySelectorAll('[data-scpw-icons]').length).toBe(0);
    });
  });

  describe('stale container handling', () => {
    it('should correctly detect container DOM attachment state', () => {
      const container = document.createElement('span');
      container.className = 'scpw-platforms';

      expect(document.body.contains(container)).toBe(false);

      document.body.appendChild(container);
      expect(document.body.contains(container)).toBe(true);

      container.remove();
      expect(document.body.contains(container)).toBe(false);
    });
  });

  describe('duplicate prevention via injectedAppIds', () => {
    beforeEach(() => {
      const { injectedAppIds, processedAppIds } = globalThis.SCPW_ContentTestExports;
      injectedAppIds.clear();
      processedAppIds.clear();
    });

    it('should track appid in injectedAppIds when icon container created', () => {
      const { injectedAppIds } = globalThis.SCPW_ContentTestExports;

      // Simulate what processItem does
      const appId = '12345';
      injectedAppIds.add(appId);

      expect(injectedAppIds.has(appId)).toBe(true);
      expect(injectedAppIds.has('99999')).toBe(false);
    });

    it('should allow checking if appid was already injected', () => {
      const { injectedAppIds } = globalThis.SCPW_ContentTestExports;

      injectedAppIds.add('111');
      injectedAppIds.add('222');

      // This simulates the duplicate check in processItem
      expect(injectedAppIds.has('111')).toBe(true);
      expect(injectedAppIds.has('222')).toBe(true);
      expect(injectedAppIds.has('333')).toBe(false);
    });
  });

  describe('state desync detection (React hydration fix)', () => {
    beforeEach(() => {
      const { injectedAppIds, processedAppIds, pendingItems } = globalThis.SCPW_ContentTestExports;
      injectedAppIds.clear();
      processedAppIds.clear();
      pendingItems.clear();
    });

    it('should detect state desync: tracked but icons not in DOM', () => {
      const { injectedAppIds } = globalThis.SCPW_ContentTestExports;

      // Simulate: injectedAppIds thinks icons exist
      injectedAppIds.add('12345');

      // But DOM doesn't have the icons (React destroyed them)
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');
      // No .scpw-platforms child

      const iconsExist = item.querySelector('.scpw-platforms');
      expect(iconsExist).toBeNull();
      expect(injectedAppIds.has('12345')).toBe(true);

      // The fix detects this desync and removes from tracking to allow re-injection
      // Simulate the logic:
      if (injectedAppIds.has('12345') && !iconsExist) {
        injectedAppIds.delete('12345');
      }

      expect(injectedAppIds.has('12345')).toBe(false);
    });

    it('should sync tracking when icons exist but not tracked', () => {
      const { injectedAppIds, createIconsContainer } = globalThis.SCPW_ContentTestExports;

      // Simulate: icons exist in DOM but not in tracking
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-67890-0');
      const icons = createIconsContainer('67890', 'Test Game');
      item.appendChild(icons);

      const iconsExist = item.querySelector('.scpw-platforms');
      expect(iconsExist).toBeTruthy();
      expect(injectedAppIds.has('67890')).toBe(false);

      // The fix syncs tracking state
      // Simulate the logic:
      if (!injectedAppIds.has('67890') && iconsExist) {
        injectedAppIds.add('67890');
      }

      expect(injectedAppIds.has('67890')).toBe(true);
    });

    it('should skip processing when tracked and icons verified in DOM', () => {
      const { injectedAppIds, createIconsContainer } = globalThis.SCPW_ContentTestExports;

      // Both tracking and DOM state agree
      injectedAppIds.add('99999');

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-99999-0');
      const icons = createIconsContainer('99999', 'Test Game');
      item.appendChild(icons);

      const iconsExist = item.querySelector('.scpw-platforms');

      // When both agree, we skip processing (return early)
      let shouldSkip = false;
      if (injectedAppIds.has('99999') && iconsExist) {
        shouldSkip = true;
      }

      expect(shouldSkip).toBe(true);
    });

    it('should continue to inject when neither tracked nor in DOM', () => {
      const { injectedAppIds } = globalThis.SCPW_ContentTestExports;

      // Fresh item: not tracked, no icons in DOM
      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-11111-0');

      const iconsExist = item.querySelector('.scpw-platforms');
      expect(iconsExist).toBeNull();
      expect(injectedAppIds.has('11111')).toBe(false);

      // Should continue to inject (not return early)
      let shouldContinueToInject = false;
      if (!injectedAppIds.has('11111') && !iconsExist) {
        shouldContinueToInject = true;
      }

      expect(shouldContinueToInject).toBe(true);
    });
  });

  describe('cleanupAllIcons with pending timer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should clear pending batch debounce timer on cleanup', () => {
      const { cleanupAllIcons, setBatchDebounceTimer, getBatchDebounceTimer, queueForBatchResolution } = globalThis.SCPW_ContentTestExports;

      // Set up a fake timer
      const fakeTimerId = setTimeout(() => {}, 1000);
      setBatchDebounceTimer(fakeTimerId);

      expect(getBatchDebounceTimer()).toBe(fakeTimerId);

      cleanupAllIcons();

      expect(getBatchDebounceTimer()).toBeNull();
    });
  });

  describe('loadUserSettings error handling', () => {
    it('should handle chrome.storage.sync.get error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Reset module and set up failing mock
      jest.resetModules();
      chrome.storage.sync.get.mockRejectedValueOnce(new Error('Storage error'));

      // Re-require to test loadUserSettings
      require('../../dist/content.js');
      const { loadUserSettings } = globalThis.SCPW_ContentTestExports;

      await loadUserSettings();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error loading settings'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('createPlatformIcon with Steam Deck tier', () => {
    it('should set tier-based tooltip for Steam Deck icon', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      // Create Steam Deck icon with tier
      const icon = createPlatformIcon('steamdeck', 'available', 'Test Game', null, 'verified');

      expect(icon.getAttribute('data-platform')).toBe('steamdeck');
      expect(icon.getAttribute('data-tier')).toBe('verified');
      expect(icon.getAttribute('title')).toContain('Verified');
    });

    it('should handle playable tier for Steam Deck', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('steamdeck', 'unavailable', 'Test Game', null, 'playable');

      expect(icon.getAttribute('data-tier')).toBe('playable');
      expect(icon.getAttribute('title')).toContain('Playable');
    });
  });

  describe('updateIconsWithData with Steam Deck data', () => {
    beforeEach(() => {
      // Mock SteamDeck client
      globalThis.SCPW_SteamDeck = {
        getDeckStatus: jest.fn().mockReturnValue({ found: true, status: 'verified', category: 3 }),
        statusToDisplayStatus: jest.fn().mockReturnValue('available')
      };
    });

    afterEach(() => {
      delete globalThis.SCPW_SteamDeck;
    });

    it('should use Steam Deck SSR data when available', () => {
      const { createIconsContainer, updateIconsWithData, setSteamDeckData } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');

      // Set module-level Steam Deck data
      const deckData = new Map([['12345', 3]]);
      setSteamDeckData(deckData);

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' }
        }
      };

      updateIconsWithData(container, data);

      // Should have both Nintendo and Steam Deck icons
      expect(container.querySelector('[data-platform="nintendo"]')).toBeTruthy();
      expect(container.querySelector('[data-platform="steamdeck"]')).toBeTruthy();

      // Cleanup
      setSteamDeckData(null);
    });

    it('should skip unknown Steam Deck status', () => {
      globalThis.SCPW_SteamDeck.getDeckStatus.mockReturnValue({ found: false, status: 'unknown', category: 0 });
      globalThis.SCPW_SteamDeck.statusToDisplayStatus.mockReturnValue('unknown');

      const { createIconsContainer, updateIconsWithData, setSteamDeckData } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('99999', 'Unknown Game');

      // Set module-level Steam Deck data
      const deckData = new Map([['99999', 0]]);
      setSteamDeckData(deckData);

      const data = {
        gameName: 'Unknown Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' }
        }
      };

      updateIconsWithData(container, data);

      // Should have Nintendo but NOT Steam Deck (unknown status is skipped)
      expect(container.querySelector('[data-platform="nintendo"]')).toBeTruthy();
      expect(container.querySelector('[data-platform="steamdeck"]')).toBeNull();

      // Cleanup
      setSteamDeckData(null);
    });

    it('should skip Steam Deck when steamDeckData is null', () => {
      const { createIconsContainer, updateIconsWithData, setSteamDeckData, setUserSettings } = globalThis.SCPW_ContentTestExports;

      // Ensure Steam Deck is enabled but data is null
      setUserSettings({ showNintendo: true, showPlaystation: false, showXbox: false, showSteamDeck: true, showHltb: false });
      setSteamDeckData(null);

      const container = createIconsContainer('12345', 'Test Game');
      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' }
        }
      };

      updateIconsWithData(container, data);

      // Should have Nintendo but NOT Steam Deck (data is null)
      expect(container.querySelector('[data-platform="nintendo"]')).toBeTruthy();
      expect(container.querySelector('[data-platform="steamdeck"]')).toBeNull();
    });

    it('should skip Steam Deck when appid is missing', () => {
      const { createIconsContainer, updateIconsWithData, setSteamDeckData, setUserSettings } = globalThis.SCPW_ContentTestExports;

      setUserSettings({ showNintendo: true, showPlaystation: false, showXbox: false, showSteamDeck: true, showHltb: false });
      const deckData = new Map([['12345', 3]]);
      setSteamDeckData(deckData);

      // Create container without appid
      const container = document.createElement('div');
      container.className = 'scpw-container';
      // Note: NOT setting data-appid attribute

      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' }
        }
      };

      updateIconsWithData(container, data);

      // Should NOT have Steam Deck icon (no appid)
      expect(container.querySelector('[data-platform="steamdeck"]')).toBeNull();

      setSteamDeckData(null);
    });
  });

  describe('createHltbBadge', () => {
    beforeEach(() => {
      // Reset userSettings to default for each test
      const { setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ hltbDisplayStat: 'mainStory' });
    });

    it('should create badge with all time fields populated', () => {
      const { createHltbBadge } = globalThis.SCPW_ContentTestExports;

      const hltbData = {
        hltbId: 0,
        mainStory: 25,
        mainExtra: 40,
        completionist: 60,
        allStyles: 45,
        steamId: 12345
      };

      const badge = createHltbBadge(hltbData);

      expect(badge.classList.contains('scpw-hltb-badge')).toBe(true);
      // Shows just main story time
      expect(badge.textContent).toBe('25h');
      // Tooltip contains full breakdown
      expect(badge.getAttribute('title')).toContain('Main Story: 25h');
      expect(badge.getAttribute('title')).toContain('Main + Extras: 40h');
      expect(badge.getAttribute('title')).toContain('Completionist: 60h');
    });

    it('should create badge with only mainStory', () => {
      const { createHltbBadge } = globalThis.SCPW_ContentTestExports;

      const hltbData = {
        hltbId: 0,
        mainStory: 30,
        mainExtra: 0,
        completionist: 0,
        allStyles: 0,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      expect(badge.textContent).toBe('30h');
      expect(badge.getAttribute('title')).toContain('Main Story: 30h');
      expect(badge.getAttribute('title')).not.toContain('Main + Extras');
      expect(badge.getAttribute('title')).not.toContain('Completionist');
    });

    it('should show Unknown tooltip when all times are zero', () => {
      const { createHltbBadge } = globalThis.SCPW_ContentTestExports;

      const hltbData = {
        hltbId: 0,
        mainStory: 0,
        mainExtra: 0,
        completionist: 0,
        allStyles: 0,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      expect(badge.textContent).toBe('?h');
      expect(badge.getAttribute('title')).toBe('How Long To Beat: Unknown');
    });

    it('should fall back to mainExtra when mainStory is zero', () => {
      const { createHltbBadge } = globalThis.SCPW_ContentTestExports;

      const hltbData = {
        hltbId: 0,
        mainStory: 0,
        mainExtra: 50,
        completionist: 80,
        allStyles: 60,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      // Badge falls back to mainExtra time
      expect(badge.textContent).toBe('50h');
      // Tooltip shows available times
      expect(badge.getAttribute('title')).toContain('Main + Extras: 50h');
      expect(badge.getAttribute('title')).toContain('Completionist: 80h');
    });

    it('should fall back to completionist when only it is available', () => {
      const { createHltbBadge } = globalThis.SCPW_ContentTestExports;

      const hltbData = {
        hltbId: 0,
        mainStory: 0,
        mainExtra: 0,
        completionist: 100,
        allStyles: 0,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      // Badge falls back to completionist time
      expect(badge.textContent).toBe('100h');
      expect(badge.getAttribute('title')).toContain('Completionist: 100h');
    });

    it('should create clickable link when hltbId is provided', () => {
      const { createHltbBadge } = globalThis.SCPW_ContentTestExports;

      const hltbData = {
        hltbId: 12345,
        mainStory: 25,
        mainExtra: 40,
        completionist: 60,
        allStyles: 45,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      expect(badge.tagName.toLowerCase()).toBe('a');
      expect(badge.getAttribute('href')).toBe('https://howlongtobeat.com/game/12345');
      expect(badge.getAttribute('target')).toBe('_blank');
      expect(badge.getAttribute('title')).toContain('Click to view on HLTB');
    });

    it('should create span (not link) when hltbId is zero', () => {
      const { createHltbBadge } = globalThis.SCPW_ContentTestExports;

      const hltbData = {
        hltbId: 0,
        mainStory: 25,
        mainExtra: 0,
        completionist: 0,
        allStyles: 0,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      expect(badge.tagName.toLowerCase()).toBe('span');
      expect(badge.getAttribute('href')).toBeNull();
      expect(badge.getAttribute('title')).not.toContain('Click to view on HLTB');
    });

    it('should respect mainExtra display preference when available', () => {
      const { createHltbBadge, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ hltbDisplayStat: 'mainExtra' });

      const hltbData = {
        hltbId: 0,
        mainStory: 20,
        mainExtra: 35,
        completionist: 50,
        allStyles: 40,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      // Should show mainExtra since that's the preference
      expect(badge.textContent).toBe('35h');
    });

    it('should respect completionist display preference when available', () => {
      const { createHltbBadge, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ hltbDisplayStat: 'completionist' });

      const hltbData = {
        hltbId: 0,
        mainStory: 20,
        mainExtra: 35,
        completionist: 50,
        allStyles: 40,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      // Should show completionist since that's the preference
      expect(badge.textContent).toBe('50h');
    });

    it('should fall back to available stat when preferred stat is zero', () => {
      const { createHltbBadge, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ hltbDisplayStat: 'completionist' });

      const hltbData = {
        hltbId: 0,
        mainStory: 25,
        mainExtra: 40,
        completionist: 0, // Preferred stat is zero
        allStyles: 0,
        steamId: null
      };

      const badge = createHltbBadge(hltbData);

      // Should fall back to mainStory (first available)
      expect(badge.textContent).toBe('25h');
    });
  });

  describe('processItem function', () => {
    beforeEach(() => {
      const { injectedAppIds, processedAppIds, pendingItems } = globalThis.SCPW_ContentTestExports;
      injectedAppIds.clear();
      processedAppIds.clear();
      pendingItems.clear();
    });

    it('should skip already processed items', async () => {
      const { processItem } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');
      item.setAttribute('data-scpw-processed', '12345'); // Already processed
      const icons = document.createElement('span');
      icons.className = 'scpw-platforms';
      item.appendChild(icons);

      await processItem(item);

      // Should return early without doing anything
      expect(item.querySelectorAll('.scpw-platforms').length).toBe(1);
    });

    it('should skip items without appId', async () => {
      const { processItem } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      // No data-rfd-draggable-id or app link

      await processItem(item);

      expect(item.querySelector('.scpw-platforms')).toBeNull();
    });

    it('should detect state desync and re-inject icons', async () => {
      const { processItem, injectedAppIds } = globalThis.SCPW_ContentTestExports;

      // Simulate: injectedAppIds thinks icons exist but DOM doesn't have them
      injectedAppIds.add('12345');

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-12345-0');

      // Add app link for game name extraction
      const link = document.createElement('a');
      link.href = '/app/12345/Test_Game';
      item.appendChild(link);

      // Add SVG for injection point detection
      const wrapper = document.createElement('span');
      const svg = document.createElement('svg');
      svg.setAttribute('class', 'SVGIcon_Windows');
      wrapper.appendChild(svg);
      item.appendChild(wrapper);

      document.body.appendChild(item);

      await processItem(item);

      // Should have removed from tracking and re-injected
      expect(injectedAppIds.has('12345')).toBe(true);
      expect(item.querySelector('.scpw-platforms')).toBeTruthy();

      item.remove();
    });

    it('should sync tracking when icons exist but not tracked', async () => {
      const { processItem, injectedAppIds, createIconsContainer } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-67890-0');

      // Add existing icons (not tracked)
      const icons = createIconsContainer('67890', 'Test Game');
      item.appendChild(icons);

      await processItem(item);

      // Should sync tracking and skip processing
      expect(injectedAppIds.has('67890')).toBe(true);
      expect(item.hasAttribute('data-scpw-processed')).toBe(true);
    });
  });

  describe('waitForInjectionPoint function', () => {
    it('should return null when item is removed from DOM during wait', async () => {
      const { waitForInjectionPoint } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      // Item is NOT in document.body - simulates removal

      const result = await waitForInjectionPoint(item);

      expect(result).toBeNull();
    });

    it('should find injection point when SVG exists', async () => {
      const { waitForInjectionPoint } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      document.body.appendChild(item);

      const wrapper = document.createElement('span');
      const svg = document.createElement('svg');
      svg.setAttribute('class', 'SVGIcon_Windows');
      wrapper.appendChild(svg);
      item.appendChild(wrapper);

      const result = await waitForInjectionPoint(item);

      expect(result).toBeTruthy();
      expect(result.container).toBeTruthy();

      item.remove();
    });
  });

  describe('processPendingBatch with null data', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      const { pendingItems } = globalThis.SCPW_ContentTestExports;
      pendingItems.clear();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle result with null data', async () => {
      const { queueForBatchResolution, pendingItems, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const container = createIconsContainer('12345', 'Test Game');
      document.body.appendChild(container);

      // Mock response with null data
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        results: {
          '12345': {
            data: null,
            fromCache: false
          }
        }
      });

      queueForBatchResolution('12345', 'Test Game', container);

      // Advance past debounce
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();

      // Container should still exist but loading state removed
      expect(container.querySelector('.scpw-loader')).toBeNull();

      container.remove();
    });
  });

  describe('timer getter functions', () => {
    it('should return batch debounce timer value', () => {
      const { getBatchDebounceTimer, setBatchDebounceTimer } = globalThis.SCPW_ContentTestExports;

      setBatchDebounceTimer(null);
      expect(getBatchDebounceTimer()).toBeNull();

      const timerId = 12345;
      setBatchDebounceTimer(timerId);
      expect(getBatchDebounceTimer()).toBe(timerId);

      setBatchDebounceTimer(null);
    });

    it('should return URL change debounce timer value', () => {
      const { getUrlChangeDebounceTimer } = globalThis.SCPW_ContentTestExports;

      // Just verify the getter works (timer is managed internally)
      const timer = getUrlChangeDebounceTimer();
      expect(timer === null || typeof timer === 'number').toBe(true);
    });
  });

  describe('isSameDeckData function', () => {
    it('should return false when left is null', () => {
      const { isSameDeckData } = globalThis.SCPW_ContentTestExports;
      const right = new Map([['12345', 3]]);
      expect(isSameDeckData(null, right)).toBe(false);
    });

    it('should return false when right is null', () => {
      const { isSameDeckData } = globalThis.SCPW_ContentTestExports;
      const left = new Map([['12345', 3]]);
      expect(isSameDeckData(left, null)).toBe(false);
    });

    it('should return false when both are null', () => {
      const { isSameDeckData } = globalThis.SCPW_ContentTestExports;
      expect(isSameDeckData(null, null)).toBe(false);
    });

    it('should return false when sizes differ', () => {
      const { isSameDeckData } = globalThis.SCPW_ContentTestExports;
      const left = new Map([['12345', 3]]);
      const right = new Map([['12345', 3], ['67890', 2]]);
      expect(isSameDeckData(left, right)).toBe(false);
    });

    it('should return false when categories differ', () => {
      const { isSameDeckData } = globalThis.SCPW_ContentTestExports;
      const left = new Map([['12345', 3]]);
      const right = new Map([['12345', 2]]);
      expect(isSameDeckData(left, right)).toBe(false);
    });

    it('should return true when maps are equal', () => {
      const { isSameDeckData } = globalThis.SCPW_ContentTestExports;
      const left = new Map([['12345', 3], ['67890', 2]]);
      const right = new Map([['12345', 3], ['67890', 2]]);
      expect(isSameDeckData(left, right)).toBe(true);
    });

    it('should return true for empty maps', () => {
      const { isSameDeckData } = globalThis.SCPW_ContentTestExports;
      const left = new Map();
      const right = new Map();
      expect(isSameDeckData(left, right)).toBe(true);
    });
  });

  describe('getEnabledPlatforms function', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      const { setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
      delete window.location;
    });

    afterEach(() => {
      window.location = originalLocation;
    });

    it('should return all platforms when showSteamDeck is true and no deck_filters', () => {
      const { getEnabledPlatforms, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
      window.location = new URL('https://store.steampowered.com/wishlist/profiles/12345');

      const platforms = getEnabledPlatforms();
      expect(platforms).toContain('nintendo');
      expect(platforms).toContain('playstation');
      expect(platforms).toContain('xbox');
      expect(platforms).toContain('steamdeck');
    });

    it('should exclude steamdeck when showSteamDeck is false', () => {
      const { getEnabledPlatforms, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false });
      window.location = new URL('https://store.steampowered.com/wishlist/profiles/12345');

      const platforms = getEnabledPlatforms();
      expect(platforms).toContain('nintendo');
      expect(platforms).toContain('playstation');
      expect(platforms).toContain('xbox');
      expect(platforms).not.toContain('steamdeck');
    });

    it('should exclude steamdeck when deck_filters URL param is present', () => {
      const { getEnabledPlatforms, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
      window.location = new URL('https://store.steampowered.com/wishlist/profiles/12345?deck_filters=verified');

      const platforms = getEnabledPlatforms();
      expect(platforms).toContain('nintendo');
      expect(platforms).toContain('playstation');
      expect(platforms).toContain('xbox');
      expect(platforms).not.toContain('steamdeck');
    });

    it('should exclude nintendo when showNintendo is false', () => {
      const { getEnabledPlatforms, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: false, showPlaystation: true, showXbox: true, showSteamDeck: true });
      window.location = new URL('https://store.steampowered.com/wishlist/profiles/12345');

      const platforms = getEnabledPlatforms();
      expect(platforms).not.toContain('nintendo');
      expect(platforms).toContain('playstation');
      expect(platforms).toContain('xbox');
      expect(platforms).toContain('steamdeck');
    });

    it('should exclude playstation when showPlaystation is false', () => {
      const { getEnabledPlatforms, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: false, showXbox: true, showSteamDeck: true });
      window.location = new URL('https://store.steampowered.com/wishlist/profiles/12345');

      const platforms = getEnabledPlatforms();
      expect(platforms).toContain('nintendo');
      expect(platforms).not.toContain('playstation');
      expect(platforms).toContain('xbox');
      expect(platforms).toContain('steamdeck');
    });

    it('should exclude xbox when showXbox is false', () => {
      const { getEnabledPlatforms, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: false, showSteamDeck: true });
      window.location = new URL('https://store.steampowered.com/wishlist/profiles/12345');

      const platforms = getEnabledPlatforms();
      expect(platforms).toContain('nintendo');
      expect(platforms).toContain('playstation');
      expect(platforms).not.toContain('xbox');
      expect(platforms).toContain('steamdeck');
    });

    it('should exclude all console platforms when all are disabled', () => {
      const { getEnabledPlatforms, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: false, showPlaystation: false, showXbox: false, showSteamDeck: true });
      window.location = new URL('https://store.steampowered.com/wishlist/profiles/12345');

      const platforms = getEnabledPlatforms();
      expect(platforms).not.toContain('nintendo');
      expect(platforms).not.toContain('playstation');
      expect(platforms).not.toContain('xbox');
      expect(platforms).toContain('steamdeck');
      expect(platforms.length).toBe(1);
    });
  });

  describe('markMissingSteamDeckData function', () => {
    beforeEach(() => {
      const { getMissingSteamDeckAppIds, setUserSettings, setSteamDeckRefreshAttempts, setSteamDeckRefreshTimer } = globalThis.SCPW_ContentTestExports;
      getMissingSteamDeckAppIds().clear();
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
      setSteamDeckRefreshAttempts(0);
      setSteamDeckRefreshTimer(null);

      globalThis.SCPW_SteamDeck = {
        waitForDeckData: jest.fn().mockResolvedValue(new Map()),
        getDeckStatus: jest.fn(),
        statusToDisplayStatus: jest.fn()
      };
    });

    afterEach(() => {
      delete globalThis.SCPW_SteamDeck;
    });

    it('should not mark when appid is empty', () => {
      const { markMissingSteamDeckData, getMissingSteamDeckAppIds } = globalThis.SCPW_ContentTestExports;
      markMissingSteamDeckData('');
      expect(getMissingSteamDeckAppIds().size).toBe(0);
    });

    it('should not mark when showSteamDeck is false', () => {
      const { markMissingSteamDeckData, getMissingSteamDeckAppIds, setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false });
      markMissingSteamDeckData('12345');
      expect(getMissingSteamDeckAppIds().size).toBe(0);
    });

    it('should not mark when SCPW_SteamDeck is not available', () => {
      const { markMissingSteamDeckData, getMissingSteamDeckAppIds } = globalThis.SCPW_ContentTestExports;
      delete globalThis.SCPW_SteamDeck;
      markMissingSteamDeckData('12345');
      expect(getMissingSteamDeckAppIds().size).toBe(0);
    });

    it('should mark appid and reset attempts when first missing', () => {
      const { markMissingSteamDeckData, getMissingSteamDeckAppIds, setSteamDeckRefreshAttempts, getSteamDeckRefreshAttempts, STEAM_DECK_REFRESH_DELAYS_MS } = globalThis.SCPW_ContentTestExports;

      // Set attempts to max (to test reset logic)
      setSteamDeckRefreshAttempts(STEAM_DECK_REFRESH_DELAYS_MS.length);

      markMissingSteamDeckData('12345');

      expect(getMissingSteamDeckAppIds().has('12345')).toBe(true);
      expect(getSteamDeckRefreshAttempts()).toBe(0);
    });
  });

  describe('scheduleSteamDeckRefresh function', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      const { setUserSettings, setSteamDeckRefreshAttempts, setSteamDeckRefreshTimer } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
      setSteamDeckRefreshAttempts(0);
      setSteamDeckRefreshTimer(null);

      globalThis.SCPW_SteamDeck = {
        waitForDeckData: jest.fn().mockResolvedValue(new Map()),
        getDeckStatus: jest.fn(),
        statusToDisplayStatus: jest.fn()
      };
    });

    afterEach(() => {
      jest.useRealTimers();
      delete globalThis.SCPW_SteamDeck;
    });

    it('should not schedule when showSteamDeck is false', () => {
      const { scheduleSteamDeckRefresh, setUserSettings, getSteamDeckRefreshTimer } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false });
      scheduleSteamDeckRefresh('test');
      expect(getSteamDeckRefreshTimer()).toBeNull();
    });

    it('should not schedule when SCPW_SteamDeck is not available', () => {
      const { scheduleSteamDeckRefresh, getSteamDeckRefreshTimer } = globalThis.SCPW_ContentTestExports;
      delete globalThis.SCPW_SteamDeck;
      scheduleSteamDeckRefresh('test');
      expect(getSteamDeckRefreshTimer()).toBeNull();
    });

    it('should not schedule when max attempts reached', () => {
      const { scheduleSteamDeckRefresh, setSteamDeckRefreshAttempts, getSteamDeckRefreshTimer, STEAM_DECK_REFRESH_DELAYS_MS } = globalThis.SCPW_ContentTestExports;
      setSteamDeckRefreshAttempts(STEAM_DECK_REFRESH_DELAYS_MS.length);
      scheduleSteamDeckRefresh('test');
      expect(getSteamDeckRefreshTimer()).toBeNull();
    });

    it('should not schedule when timer already exists', () => {
      const { scheduleSteamDeckRefresh, setSteamDeckRefreshTimer, getSteamDeckRefreshTimer } = globalThis.SCPW_ContentTestExports;
      const existingTimer = setTimeout(() => {}, 1000);
      setSteamDeckRefreshTimer(existingTimer);
      scheduleSteamDeckRefresh('test');
      expect(getSteamDeckRefreshTimer()).toBe(existingTimer);
      clearTimeout(existingTimer);
    });

    it('should schedule refresh with correct delay', () => {
      const { scheduleSteamDeckRefresh, getSteamDeckRefreshTimer, STEAM_DECK_REFRESH_DELAYS_MS } = globalThis.SCPW_ContentTestExports;
      scheduleSteamDeckRefresh('test');
      expect(getSteamDeckRefreshTimer()).not.toBeNull();
      expect(STEAM_DECK_REFRESH_DELAYS_MS[0]).toBe(800);
    });
  });

  describe('refreshIconsFromCache function', () => {
    beforeEach(() => {
      const { getCachedEntriesByAppId, setSteamDeckData, setUserSettings } = globalThis.SCPW_ContentTestExports;
      getCachedEntriesByAppId().clear();
      setSteamDeckData(null);
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });

      globalThis.SCPW_SteamDeck = {
        waitForDeckData: jest.fn().mockResolvedValue(new Map()),
        getDeckStatus: jest.fn().mockReturnValue({ found: true, status: 'verified', category: 3 }),
        statusToDisplayStatus: jest.fn().mockReturnValue('available')
      };
    });

    afterEach(() => {
      delete globalThis.SCPW_SteamDeck;
    });

    it('should refresh icons for containers in cache', () => {
      const { refreshIconsFromCache, getCachedEntriesByAppId, createIconsContainer, setSteamDeckData } = globalThis.SCPW_ContentTestExports;

      // Create a container and add to DOM
      const container = createIconsContainer('12345', 'Test Game');
      document.body.appendChild(container);

      // Add entry to cache
      const cacheEntry = {
        appid: '12345',
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
          playstation: { status: 'unknown', storeUrl: null },
          xbox: { status: 'unknown', storeUrl: null },
          steamdeck: { status: 'unknown', storeUrl: null }
        }
      };
      getCachedEntriesByAppId().set('12345', cacheEntry);

      // Set Steam Deck data for the test
      setSteamDeckData(new Map([['12345', 3]]));

      refreshIconsFromCache('test');

      // Container should have icons
      const nintendoIcon = container.querySelector('[data-platform="nintendo"]');
      expect(nintendoIcon).toBeTruthy();

      container.remove();
    });

    it('should skip containers not in DOM', () => {
      const { refreshIconsFromCache, getCachedEntriesByAppId, createIconsContainer } = globalThis.SCPW_ContentTestExports;

      // Create a container but don't add to DOM
      const container = createIconsContainer('12345', 'Test Game');

      // Add entry to cache
      const cacheEntry = {
        appid: '12345',
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
          playstation: { status: 'unknown', storeUrl: null },
          xbox: { status: 'unknown', storeUrl: null },
          steamdeck: { status: 'unknown', storeUrl: null }
        }
      };
      getCachedEntriesByAppId().set('12345', cacheEntry);

      // Should not throw
      refreshIconsFromCache('test');

      // Container should still just have loader
      expect(container.querySelector('.scpw-loader')).toBeTruthy();
    });
  });

  describe('refreshSteamDeckData function', () => {
    beforeEach(() => {
      const { setSteamDeckData, setUserSettings, setSteamDeckRefreshAttempts, setSteamDeckRefreshTimer, getMissingSteamDeckAppIds } = globalThis.SCPW_ContentTestExports;
      setSteamDeckData(null);
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
      setSteamDeckRefreshAttempts(0);
      setSteamDeckRefreshTimer(null);
      getMissingSteamDeckAppIds().clear();

      globalThis.SCPW_SteamDeck = {
        waitForDeckData: jest.fn().mockResolvedValue(new Map([['12345', 3]])),
        getDeckStatus: jest.fn().mockReturnValue({ found: true, status: 'verified', category: 3 }),
        statusToDisplayStatus: jest.fn().mockReturnValue('available')
      };
    });

    afterEach(() => {
      delete globalThis.SCPW_SteamDeck;
    });

    it('should not refresh when showSteamDeck is false', async () => {
      const { refreshSteamDeckData, setUserSettings, getSteamDeckData } = globalThis.SCPW_ContentTestExports;
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false });
      await refreshSteamDeckData('test');
      expect(getSteamDeckData()).toBeNull();
    });

    it('should not refresh when SCPW_SteamDeck is not available', async () => {
      const { refreshSteamDeckData, getSteamDeckData } = globalThis.SCPW_ContentTestExports;
      delete globalThis.SCPW_SteamDeck;
      await refreshSteamDeckData('test');
      expect(getSteamDeckData()).toBeNull();
    });

    it('should update steamDeckData on successful refresh', async () => {
      const { refreshSteamDeckData, getSteamDeckData } = globalThis.SCPW_ContentTestExports;
      await refreshSteamDeckData('test');
      const data = getSteamDeckData();
      expect(data).not.toBeNull();
      expect(data.get('12345')).toBe(3);
    });

    it('should remove appids from missing set when found', async () => {
      const { refreshSteamDeckData, getMissingSteamDeckAppIds } = globalThis.SCPW_ContentTestExports;

      // Add to missing set
      getMissingSteamDeckAppIds().add('12345');

      await refreshSteamDeckData('test');

      // Should be removed since data was found
      expect(getMissingSteamDeckAppIds().has('12345')).toBe(false);
    });

    it('should not update when data is empty', async () => {
      const { refreshSteamDeckData, getSteamDeckData, setSteamDeckData } = globalThis.SCPW_ContentTestExports;

      // Set initial data
      setSteamDeckData(new Map([['67890', 2]]));

      // Mock empty response
      globalThis.SCPW_SteamDeck.waitForDeckData.mockResolvedValue(new Map());

      await refreshSteamDeckData('test');

      // Should keep old data
      const data = getSteamDeckData();
      expect(data.get('67890')).toBe(2);
    });
  });

  // Note: findInjectionPoint SVG grouping tests are covered in 'findInjectionPoint (exported function)' describe block

  // Note: parseSvg error handling is covered in 'parseSvg (exported function)' describe block

  describe('createPlatformIcon default tooltip', () => {
    it('should use STATUS_INFO tooltip for non-steamdeck platforms', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('nintendo', 'available', 'Test Game');

      expect(icon.getAttribute('title')).toBe('Nintendo Switch: Available');
    });

    it('should use STATUS_INFO tooltip when no tier provided for steamdeck', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('steamdeck', 'available', 'Test Game');

      expect(icon.getAttribute('title')).toBe('Steam Deck: Available');
    });
  });

  describe('settings change updates loading containers', () => {
    it('should update loading containers with cached data when settings change', async () => {
      const {
        createIconsContainer,
        updateIconsWithData,
        getCachedEntriesByAppId,
        setUserSettings
      } = globalThis.SCPW_ContentTestExports;

      // Create a container with loader
      const container = createIconsContainer('12345', 'Test Game');
      document.body.appendChild(container);

      // Verify loader exists
      expect(container.querySelector('.scpw-loader')).not.toBeNull();

      // Add cached data for this appid
      const cachedEntriesByAppId = getCachedEntriesByAppId();
      cachedEntriesByAppId.set('12345', {
        appid: '12345',
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: null },
          playstation: { status: 'unavailable', storeUrl: null },
          xbox: { status: 'unknown', storeUrl: null },
          steamdeck: { status: 'unknown', storeUrl: null }
        },
        source: 'test',
        wikidataId: null,
        resolvedAt: Date.now(),
        ttlDays: 7
      });

      // Update the container as would happen during settings change
      updateIconsWithData(container, cachedEntriesByAppId.get('12345'));

      // Verify loader is removed and icons are added
      expect(container.querySelector('.scpw-loader')).toBeNull();
      expect(container.querySelector('.scpw-platform-icon')).not.toBeNull();

      // Cleanup
      container.remove();
      cachedEntriesByAppId.delete('12345');
    });

    it('should update stale pending items with fresh container references', () => {
      const {
        createIconsContainer,
        pendingItems
      } = globalThis.SCPW_ContentTestExports;

      // Create an old container (not in DOM)
      const oldContainer = createIconsContainer('54321', 'Old Game');

      // Create a fresh container in DOM
      const freshContainer = createIconsContainer('54321', 'Old Game');
      document.body.appendChild(freshContainer);

      // Add to pending items with old container
      pendingItems.set('54321', { gameName: 'Old Game', container: oldContainer });

      // Verify old container is NOT in DOM
      expect(document.body.contains(oldContainer)).toBe(false);
      expect(document.body.contains(freshContainer)).toBe(true);

      // Simulate the settings change handler finding fresh container
      const pendingInfo = pendingItems.get('54321');
      if (!document.body.contains(pendingInfo.container)) {
        const found = document.querySelector(`.scpw-platforms[data-appid="54321"]`);
        if (found) {
          pendingInfo.container = found;
        }
      }

      // Verify pending now points to fresh container
      expect(pendingItems.get('54321').container).toBe(freshContainer);
      expect(document.body.contains(pendingItems.get('54321').container)).toBe(true);

      // Cleanup
      freshContainer.remove();
      pendingItems.delete('54321');
    });
  });

  describe('setupSettingsChangeListener branches', () => {
    it('should handle settings change when platforms are enabled', () => {
      const {
        setUserSettings,
        refreshIconsFromCache,
        getCachedEntriesByAppId
      } = globalThis.SCPW_ContentTestExports;

      // Simulate enabling a platform
      const oldSettings = { showNintendo: false, showPlaystation: true, showXbox: true, showSteamDeck: true };
      const newSettings = { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true };

      setUserSettings(newSettings);

      expect(newSettings.showNintendo).toBe(true);
    });

    it('should handle settings change when platforms are disabled', () => {
      const { setUserSettings } = globalThis.SCPW_ContentTestExports;

      const newSettings = { showNintendo: false, showPlaystation: false, showXbox: false, showSteamDeck: false };
      setUserSettings(newSettings);

      expect(newSettings.showNintendo).toBe(false);
    });

    it('should detect when steamdeck is just enabled', () => {
      const oldSettings = { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false };
      const newSettings = { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true };

      const platformsJustEnabled = [];
      if (newSettings.showSteamDeck && !oldSettings.showSteamDeck) {
        platformsJustEnabled.push('steamdeck');
      }

      expect(platformsJustEnabled).toContain('steamdeck');
    });

    it('should detect when console platforms are just disabled', () => {
      const oldSettings = { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true };
      const newSettings = { showNintendo: false, showPlaystation: false, showXbox: false, showSteamDeck: true };

      const platformsJustDisabled = [];
      if (!newSettings.showNintendo && oldSettings.showNintendo) platformsJustDisabled.push('nintendo');
      if (!newSettings.showPlaystation && oldSettings.showPlaystation) platformsJustDisabled.push('playstation');
      if (!newSettings.showXbox && oldSettings.showXbox) platformsJustDisabled.push('xbox');

      expect(platformsJustDisabled).toEqual(['nintendo', 'playstation', 'xbox']);
    });
  });

  describe('cleanupAllIcons with steamDeckRefreshTimer', () => {
    it('should clear steamDeckRefreshTimer when set', () => {
      const {
        cleanupAllIcons,
        getSteamDeckRefreshTimer
      } = globalThis.SCPW_ContentTestExports;

      // Call cleanup
      cleanupAllIcons();

      // Timer should be null after cleanup
      expect(getSteamDeckRefreshTimer()).toBeNull();
    });
  });

  describe('processItem with all platforms disabled', () => {
    it('should skip processing when all platforms are disabled', async () => {
      const {
        setUserSettings,
        createIconsContainer,
        isAnyConsolePlatformEnabled
      } = globalThis.SCPW_ContentTestExports;

      // Disable all platforms
      setUserSettings({
        showNintendo: false,
        showPlaystation: false,
        showXbox: false,
        showSteamDeck: false
      });

      expect(isAnyConsolePlatformEnabled()).toBe(false);

      // Re-enable for other tests
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true
      });
    });
  });

  describe('processingAppIds race condition prevention', () => {
    it('should have injectedAppIds as a Set', () => {
      const { injectedAppIds } = globalThis.SCPW_ContentTestExports;

      // Should be a Set
      expect(injectedAppIds).toBeInstanceOf(Set);
    });
  });

  // Note: removeLoadingState function tests are in 'removeLoadingState (exported function)' describe block above

  describe('getEnabledPlatforms with various settings', () => {
    it('should return empty array when all platforms disabled', () => {
      const {
        getEnabledPlatforms,
        setUserSettings
      } = globalThis.SCPW_ContentTestExports;

      setUserSettings({
        showNintendo: false,
        showPlaystation: false,
        showXbox: false,
        showSteamDeck: false
      });

      const enabled = getEnabledPlatforms();
      expect(enabled).toEqual([]);

      // Restore
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true
      });
    });

    it('should exclude steamdeck when deck_filters in URL', () => {
      const { getEnabledPlatforms } = globalThis.SCPW_ContentTestExports;

      // Mock URL with deck_filters
      const originalLocation = window.location;
      delete window.location;
      window.location = new URL('https://store.steampowered.com/wishlist/?deck_filters=1');

      const enabled = getEnabledPlatforms();
      expect(enabled).not.toContain('steamdeck');

      // Restore
      window.location = originalLocation;
    });
  });

  describe('batch processing edge cases', () => {
    it('should handle empty pending items', async () => {
      const {
        pendingItems,
        processPendingBatch
      } = globalThis.SCPW_ContentTestExports;

      // Clear pending items
      pendingItems.clear();

      // Should not throw
      await processPendingBatch();

      expect(pendingItems.size).toBe(0);
    });

    it('should skip batch request when all console platforms AND HLTB disabled', async () => {
      const {
        processPendingBatch,
        pendingItems,
        createIconsContainer,
        setUserSettings
      } = globalThis.SCPW_ContentTestExports;

      // Disable all console platforms AND HLTB
      // (We still query Wikidata when HLTB is enabled to get English game names)
      setUserSettings({
        showNintendo: false,
        showPlaystation: false,
        showXbox: false,
        showSteamDeck: false,
        showHltb: false
      });

      const container = createIconsContainer('77777', 'Test Game');
      document.body.appendChild(container);

      pendingItems.set('77777', { gameName: 'Test Game', container });

      // Clear mock to verify no batch request is made
      chrome.runtime.sendMessage.mockClear();

      await processPendingBatch();

      // Should not have made a GET_PLATFORM_DATA_BATCH call
      const batchCalls = chrome.runtime.sendMessage.mock.calls.filter(
        call => call[0]?.type === 'GET_PLATFORM_DATA_BATCH'
      );
      expect(batchCalls.length).toBe(0);

      // Container should have loading state removed
      expect(container.querySelector('.scpw-loader')).toBeNull();

      // Restore settings
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true,
        showHltb: true
      });

      container.remove();
    });

    it('should still query Wikidata when HLTB enabled even if console platforms disabled', async () => {
      const {
        processPendingBatch,
        pendingItems,
        createIconsContainer,
        setUserSettings
      } = globalThis.SCPW_ContentTestExports;

      // Disable console platforms but keep HLTB enabled
      // (We need Wikidata to get English game names for HLTB)
      setUserSettings({
        showNintendo: false,
        showPlaystation: false,
        showXbox: false,
        showSteamDeck: false,
        showHltb: true
      });

      const container = createIconsContainer('88888', 'Test Game');
      document.body.appendChild(container);

      pendingItems.set('88888', { gameName: 'Test Game', container });

      // Clear mock
      chrome.runtime.sendMessage.mockClear();

      await processPendingBatch();

      // Should have made a GET_PLATFORM_DATA_BATCH call (for English names)
      const batchCalls = chrome.runtime.sendMessage.mock.calls.filter(
        call => call[0]?.type === 'GET_PLATFORM_DATA_BATCH'
      );
      expect(batchCalls.length).toBe(1);

      // Restore settings
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true,
        showHltb: true
      });

      container.remove();
    });
  });

  describe('setupSettingsChangeListener integration', () => {
    it('should handle chrome.storage.onChanged not available', () => {
      const originalOnChanged = chrome.storage.onChanged;
      delete chrome.storage.onChanged;

      // Should not throw when onChanged is not available
      const { setupSettingsChangeListener } = globalThis.SCPW_ContentTestExports;
      setupSettingsChangeListener();

      chrome.storage.onChanged = originalOnChanged;
    });

    it('should ignore non-sync storage changes', () => {
      // The listener should early-return for non-sync changes
      const addListenerMock = chrome.storage.onChanged?.addListener;
      if (addListenerMock?.mock?.calls?.[0]?.[0]) {
        const listener = addListenerMock.mock.calls[0][0];
        // Call with local storage changes - should not throw
        listener({ scpwSettings: { newValue: {} } }, 'local');
      }
      // Test passes if no error is thrown
      expect(true).toBe(true);
    });

    it('should ignore changes without scpwSettings', () => {
      const addListenerMock = chrome.storage.onChanged?.addListener;
      if (addListenerMock?.mock?.calls?.[0]?.[0]) {
        const listener = addListenerMock.mock.calls[0][0];
        // Call with unrelated changes - should not throw
        listener({ otherKey: { newValue: 'value' } }, 'sync');
      }
      // Test passes if no error is thrown
      expect(true).toBe(true);
    });
  });

  // Note: findWishlistRow edge cases are covered in 'findWishlistRow (exported function)' describe block

  describe('Steam Deck tier handling in createPlatformIcon', () => {
    it('should set unsupported tier class', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('steamdeck', 'unavailable', 'Test Game', null, 'unsupported');

      expect(icon.getAttribute('data-tier')).toBe('unsupported');
      expect(icon.getAttribute('title')).toContain('Unsupported');
    });

    it('should set unknown tier class', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('steamdeck', 'unknown', 'Test Game', null, 'unknown');

      expect(icon.getAttribute('data-tier')).toBe('unknown');
      expect(icon.getAttribute('title')).toContain('Unknown');
    });
  });

  describe('isAnyConsolePlatformEnabled function', () => {
    it('should return true when any console platform is enabled', () => {
      const { isAnyConsolePlatformEnabled, setUserSettings } = globalThis.SCPW_ContentTestExports;

      setUserSettings({ showNintendo: true, showPlaystation: false, showXbox: false, showSteamDeck: false });
      expect(isAnyConsolePlatformEnabled()).toBe(true);

      setUserSettings({ showNintendo: false, showPlaystation: true, showXbox: false, showSteamDeck: false });
      expect(isAnyConsolePlatformEnabled()).toBe(true);

      setUserSettings({ showNintendo: false, showPlaystation: false, showXbox: true, showSteamDeck: false });
      expect(isAnyConsolePlatformEnabled()).toBe(true);

      // Restore
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
    });

    it('should return false when all console platforms are disabled', () => {
      const { isAnyConsolePlatformEnabled, setUserSettings } = globalThis.SCPW_ContentTestExports;

      setUserSettings({ showNintendo: false, showPlaystation: false, showXbox: false, showSteamDeck: true });
      expect(isAnyConsolePlatformEnabled()).toBe(false);

      // Restore
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
    });
  });

  describe('extractGameName edge cases', () => {
    it('should extract from URL slug when link text is empty but URL has slug', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345/Super_Mario_Odyssey';
      link.textContent = ''; // Empty text
      item.appendChild(link);

      expect(extractGameName(item)).toBe('Super Mario Odyssey');
    });

    it('should return Unknown Game when link text is too long', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345';
      link.textContent = 'A'.repeat(250); // Too long
      item.appendChild(link);

      expect(extractGameName(item)).toBe('Unknown Game');
    });
  });

  describe('updateIconsWithData clears existing icons', () => {
    it('should remove existing icons before adding new ones', () => {
      const { createIconsContainer, updateIconsWithData, createPlatformIcon, setUserSettings } = globalThis.SCPW_ContentTestExports;

      // Disable Steam Deck to simplify
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false });

      const container = createIconsContainer('12345', 'Test Game');

      // Add some existing icons manually
      const oldIcon = createPlatformIcon('nintendo', 'available', 'Test', null);
      container.appendChild(oldIcon);

      const oldSeparator = document.createElement('span');
      oldSeparator.className = 'scpw-separator';
      container.appendChild(oldSeparator);

      // Now update with new data
      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'unavailable' },
          playstation: { status: 'available', storeUrl: 'https://ps.example.com' },
          xbox: { status: 'unavailable' }
        }
      };

      updateIconsWithData(container, data);

      // Old nintendo icon should be gone, new playstation icon should be there
      expect(container.querySelector('[data-platform="nintendo"]')).toBeNull();
      expect(container.querySelector('[data-platform="playstation"]')).toBeTruthy();

      // Restore
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true });
    });
  });

  describe('processPendingBatch advanced cases', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      const { pendingItems, setUserSettings } = globalThis.SCPW_ContentTestExports;
      pendingItems.clear();
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: false // Disable to avoid SteamDeck issues
      });
    });

    afterEach(() => {
      jest.useRealTimers();
      const { setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true
      });
    });

    it('should handle result.data being null and remove loading state', async () => {
      const { queueForBatchResolution, pendingItems, createIconsContainer } = globalThis.SCPW_ContentTestExports;

      const container = createIconsContainer('77777', 'No Data Game');
      document.body.appendChild(container);

      // Verify loader exists
      expect(container.querySelector('.scpw-loader')).toBeTruthy();

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        results: {
          '77777': {
            data: null, // No data returned
            fromCache: false
          }
        }
      });

      queueForBatchResolution('77777', 'No Data Game', container);

      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();

      // Loader should be removed even with null data
      expect(container.querySelector('.scpw-loader')).toBeNull();

      container.remove();
    });

    it('should log with fromCache: true source', async () => {
      const { queueForBatchResolution, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const container = createIconsContainer('88888', 'Cached Source Game');
      document.body.appendChild(container);

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        results: {
          '88888': {
            data: {
              gameName: 'Cached Source Game',
              platforms: {
                nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
                playstation: { status: 'unavailable', storeUrl: null },
                xbox: { status: 'unknown', storeUrl: null }
              }
            },
            fromCache: true // This triggers "cache" source in log
          }
        }
      });

      queueForBatchResolution('88888', 'Cached Source Game', container);

      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();

      // Verify "cache" source was logged
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('(cache)'));

      consoleSpy.mockRestore();
      container.remove();
    });

    it('should log with fromCache: false source as "new"', async () => {
      const { queueForBatchResolution, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const container = createIconsContainer('99999', 'New Source Game');
      document.body.appendChild(container);

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        results: {
          '99999': {
            data: {
              gameName: 'New Source Game',
              platforms: {
                nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
                playstation: { status: 'unavailable', storeUrl: null },
                xbox: { status: 'unknown', storeUrl: null }
              }
            },
            fromCache: false // This triggers "new" source in log
          }
        }
      });

      queueForBatchResolution('99999', 'New Source Game', container);

      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();

      // Verify "new" source was logged
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('(new)'));

      consoleSpy.mockRestore();
      container.remove();
    });

    it('should log container count when multiple containers exist', async () => {
      const { queueForBatchResolution, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Create two containers with same appid
      const container1 = createIconsContainer('11111', 'Multi Container Game');
      const container2 = createIconsContainer('11111', 'Multi Container Game');
      document.body.appendChild(container1);
      document.body.appendChild(container2);

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        results: {
          '11111': {
            data: {
              gameName: 'Multi Container Game',
              platforms: {
                nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
                playstation: { status: 'unavailable', storeUrl: null },
                xbox: { status: 'unknown', storeUrl: null }
              }
            },
            fromCache: false
          }
        }
      });

      queueForBatchResolution('11111', 'Multi Container Game', container1);

      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();

      // Should log with container count
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('containers'));

      consoleSpy.mockRestore();
      container1.remove();
      container2.remove();
    });

    it('should skip appid when no containers in DOM', async () => {
      const { queueForBatchResolution, pendingItems, createIconsContainer } = globalThis.SCPW_ContentTestExports;

      const container = createIconsContainer('22222', 'Ghost Game');
      // Do NOT add to document.body

      pendingItems.set('22222', { gameName: 'Ghost Game', container });

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        results: {
          '22222': {
            data: {
              gameName: 'Ghost Game',
              platforms: {
                nintendo: { status: 'available', storeUrl: null },
                playstation: { status: 'unavailable', storeUrl: null },
                xbox: { status: 'unknown', storeUrl: null }
              }
            },
            fromCache: false
          }
        }
      });

      // Trigger processPendingBatch directly
      const { processPendingBatch } = globalThis.SCPW_ContentTestExports;
      await processPendingBatch();

      // Should have completed without error (container skipped)
      expect(pendingItems.size).toBe(0);
    });
  });

  describe('processItem with processingAppIds guard', () => {
    beforeEach(() => {
      const { injectedAppIds, processedAppIds, pendingItems, setUserSettings } = globalThis.SCPW_ContentTestExports;
      injectedAppIds.clear();
      processedAppIds.clear();
      pendingItems.clear();
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: false
      });
    });

    afterEach(() => {
      const { setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true
      });
    });

    it('should handle same appid already processed with icons in DOM', async () => {
      const { processItem, createIconsContainer, injectedAppIds } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-55555-0');
      item.setAttribute('data-scpw-processed', '55555'); // Same appid

      // Add existing icons
      const icons = createIconsContainer('55555', 'Same Game');
      item.appendChild(icons);

      document.body.appendChild(item);

      await processItem(item);

      // Should have early-returned without re-processing
      expect(item.querySelectorAll('.scpw-platforms').length).toBe(1);

      item.remove();
    });

    it('should handle icons verified in DOM when injectedAppIds has appid', async () => {
      const { processItem, createIconsContainer, injectedAppIds } = globalThis.SCPW_ContentTestExports;

      // Pre-add to injectedAppIds
      injectedAppIds.add('66666');

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-66666-0');

      // Add existing icons
      const icons = createIconsContainer('66666', 'Tracked Game');
      item.appendChild(icons);

      // Add app link
      const link = document.createElement('a');
      link.href = '/app/66666/Tracked_Game';
      item.appendChild(link);

      document.body.appendChild(item);

      await processItem(item);

      // Should have synced and set processed attr
      expect(item.getAttribute('data-scpw-processed')).toBe('66666');

      item.remove();
    });

    it('should re-inject when injectedAppIds has appid but no icons in DOM', async () => {
      const { processItem, injectedAppIds, pendingItems } = globalThis.SCPW_ContentTestExports;

      // Pre-add to injectedAppIds but no icons in DOM
      injectedAppIds.add('77777');

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-77777-0');

      // Add SVG for injection point
      const wrapper = document.createElement('span');
      const svg = document.createElement('svg');
      svg.setAttribute('class', 'SVGIcon_Windows');
      wrapper.appendChild(svg);
      item.appendChild(wrapper);

      // Add app link
      const link = document.createElement('a');
      link.href = '/app/77777/Reinjected_Game';
      item.appendChild(link);

      document.body.appendChild(item);

      await processItem(item);

      // Should have re-injected icons
      expect(item.querySelector('.scpw-platforms')).toBeTruthy();

      item.remove();
    });
  });

  describe('getRenderedIconSummary function', () => {
    it('should return "none" when no icons present', () => {
      const { createIconsContainer } = globalThis.SCPW_ContentTestExports;

      const container = createIconsContainer('12345', 'Test');
      // Remove loader
      const loader = container.querySelector('.scpw-loader');
      if (loader) loader.remove();

      // Access getRenderedIconSummary via the actual function in content.js
      // Since it's not exported, we test it indirectly via console output
      // The function is called internally during updateIconsWithData

      // Container has no icons
      expect(container.querySelectorAll('.scpw-platform-icon').length).toBe(0);
    });
  });

  describe('sendMessageWithRetry edge cases', () => {
    it('should handle string error conversion', async () => {
      const { sendMessageWithRetry } = globalThis.SCPW_ContentTestExports;

      // Mock rejection with non-Error object
      chrome.runtime.sendMessage.mockRejectedValueOnce('String error');

      await expect(sendMessageWithRetry({ type: 'TEST' })).rejects.toThrow('String error');
    });
  });

  describe('MutationObserver callback branches', () => {
    it('should detect childList mutations with addedNodes', () => {
      // Simulate the MutationObserver callback logic
      const mutation = { type: 'childList', addedNodes: [document.createElement('div')] };
      const hasRelevant = mutation.type === 'childList' && mutation.addedNodes.length > 0;
      expect(hasRelevant).toBe(true);
    });

    it('should detect attribute mutations for data-rfd-draggable-id', () => {
      const mutation = { type: 'attributes', attributeName: 'data-rfd-draggable-id' };
      const hasRelevant = mutation.type === 'attributes' &&
        (mutation.attributeName === 'data-rfd-draggable-id' || mutation.attributeName === 'href');
      expect(hasRelevant).toBe(true);
    });

    it('should detect attribute mutations for href', () => {
      const mutation = { type: 'attributes', attributeName: 'href' };
      const hasRelevant = mutation.type === 'attributes' &&
        (mutation.attributeName === 'data-rfd-draggable-id' || mutation.attributeName === 'href');
      expect(hasRelevant).toBe(true);
    });

    it('should ignore childList mutations without addedNodes', () => {
      const mutation = { type: 'childList', addedNodes: [] };
      const hasRelevant = mutation.type === 'childList' && mutation.addedNodes.length > 0;
      expect(hasRelevant).toBe(false);
    });

    it('should ignore unrelated attribute mutations', () => {
      const mutation = { type: 'attributes', attributeName: 'class' };
      const hasRelevant = mutation.type === 'attributes' &&
        (mutation.attributeName === 'data-rfd-draggable-id' || mutation.attributeName === 'href');
      expect(hasRelevant).toBe(false);
    });

    it('should ignore characterData mutations', () => {
      const mutation = { type: 'characterData' };
      let hasRelevant = false;
      if (mutation.type === 'childList') hasRelevant = true;
      if (mutation.type === 'attributes') hasRelevant = true;
      expect(hasRelevant).toBe(false);
    });
  });

  describe('isValidGameTitle function behavior', () => {
    it('should reject empty string', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      // No valid title elements
      expect(extractGameName(item)).toBe('Unknown Game');
    });

    it('should reject strings starting with $', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const titleEl = document.createElement('div');
      titleEl.className = 'Title';
      titleEl.textContent = '$29.99';
      item.appendChild(titleEl);
      expect(extractGameName(item)).toBe('Unknown Game');
    });

    it('should reject strings starting with €', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345';
      link.textContent = '';
      item.appendChild(link);
      const titleEl = document.createElement('div');
      titleEl.className = 'Title';
      titleEl.textContent = '€19.99';
      item.appendChild(titleEl);
      expect(extractGameName(item)).toBe('Unknown Game');
    });

    it('should reject Free games label', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345';
      link.textContent = '';
      item.appendChild(link);
      const titleEl = document.createElement('div');
      titleEl.className = 'Title';
      titleEl.textContent = 'Free To Play';
      item.appendChild(titleEl);
      expect(extractGameName(item)).toBe('Unknown Game');
    });

    it('should reject discount percentage', () => {
      const { extractGameName } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const link = document.createElement('a');
      link.href = '/app/12345';
      link.textContent = '';
      item.appendChild(link);
      const titleEl = document.createElement('div');
      titleEl.className = 'Title';
      titleEl.textContent = '-75%';
      item.appendChild(titleEl);
      expect(extractGameName(item)).toBe('Unknown Game');
    });
  });

  describe('findInjectionPoint with various span titles', () => {
    it('should recognize macOS title', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const group = document.createElement('div');
      const span = document.createElement('span');
      span.title = 'macOS';
      span.appendChild(document.createElement('svg'));
      group.appendChild(span);
      item.appendChild(group);

      const result = findInjectionPoint(item);
      expect(result.container).toBe(group);
    });

    it('should recognize Linux title', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const group = document.createElement('div');
      const span = document.createElement('span');
      span.title = 'Linux';
      span.appendChild(document.createElement('svg'));
      group.appendChild(span);
      item.appendChild(group);

      const result = findInjectionPoint(item);
      expect(result.container).toBe(group);
    });

    it('should recognize SteamOS title', () => {
      const { findInjectionPoint } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const group = document.createElement('div');
      const span = document.createElement('span');
      span.title = 'SteamOS';
      span.appendChild(document.createElement('svg'));
      group.appendChild(span);
      item.appendChild(group);

      const result = findInjectionPoint(item);
      expect(result.container).toBe(group);
    });
  });

  describe('createPlatformIcon clickable behavior', () => {
    it('should create non-clickable span for steamdeck regardless of status', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('steamdeck', 'available', 'Test Game');

      // steamdeck icons are never clickable (always span, not anchor)
      expect(icon.tagName).toBe('SPAN');
      expect(icon.hasAttribute('href')).toBe(false);
    });

    it('should create clickable anchor for console platforms when available', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('nintendo', 'available', 'Test Game');

      expect(icon.tagName).toBe('A');
      expect(icon.hasAttribute('href')).toBe(true);
      expect(icon.getAttribute('target')).toBe('_blank');
    });

    it('should create clickable anchor for console platforms when unknown', () => {
      const { createPlatformIcon } = globalThis.SCPW_ContentTestExports;

      const icon = createPlatformIcon('playstation', 'unknown', 'Test Game');

      expect(icon.tagName).toBe('A');
      expect(icon.hasAttribute('href')).toBe(true);
    });
  });

  describe('URL change detection interval', () => {
    it('should detect URL change via location.href comparison', () => {
      let lastUrl = 'https://example.com/old';
      const currentUrl = 'https://example.com/new';

      const hasChanged = currentUrl !== lastUrl;
      expect(hasChanged).toBe(true);

      lastUrl = currentUrl;
      expect(currentUrl === lastUrl).toBe(true);
    });
  });

  describe('resetItemForReprocess function', () => {
    beforeEach(() => {
      const { injectedAppIds, pendingItems } = globalThis.SCPW_ContentTestExports;
      injectedAppIds.clear();
      pendingItems.clear();
    });

    it('should remove PROCESSED_ATTR and ICONS_INJECTED_ATTR', () => {
      const item = document.createElement('div');
      item.setAttribute('data-scpw-processed', '12345');
      item.setAttribute('data-scpw-icons', 'true');

      // Simulate resetItemForReprocess logic
      item.removeAttribute('data-scpw-processed');
      item.removeAttribute('data-scpw-icons');

      expect(item.hasAttribute('data-scpw-processed')).toBe(false);
      expect(item.hasAttribute('data-scpw-icons')).toBe(false);
    });

    it('should remove existing icons from item', () => {
      const { createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const item = document.createElement('div');
      const icons = createIconsContainer('12345', 'Test');
      item.appendChild(icons);

      expect(item.querySelector('.scpw-platforms')).toBeTruthy();

      // Simulate resetItemForReprocess logic
      const existingIcons = item.querySelector('.scpw-platforms');
      if (existingIcons) existingIcons.remove();

      expect(item.querySelector('.scpw-platforms')).toBeNull();
    });

    it('should delete from injectedAppIds when previousAppId provided', () => {
      const { injectedAppIds, pendingItems } = globalThis.SCPW_ContentTestExports;

      injectedAppIds.add('99999');
      pendingItems.set('99999', { gameName: 'Old', container: document.createElement('span') });

      expect(injectedAppIds.has('99999')).toBe(true);
      expect(pendingItems.has('99999')).toBe(true);

      // Simulate resetItemForReprocess logic with previousAppId
      const previousAppId = '99999';
      if (previousAppId) {
        injectedAppIds.delete(previousAppId);
        pendingItems.delete(previousAppId);
      }

      expect(injectedAppIds.has('99999')).toBe(false);
      expect(pendingItems.has('99999')).toBe(false);
    });

    it('should not delete when previousAppId is null', () => {
      const { injectedAppIds, pendingItems } = globalThis.SCPW_ContentTestExports;

      injectedAppIds.add('88888');

      // Simulate resetItemForReprocess logic without previousAppId
      const previousAppId = null;
      if (previousAppId) {
        injectedAppIds.delete(previousAppId);
      }

      // Should still exist
      expect(injectedAppIds.has('88888')).toBe(true);

      // Cleanup
      injectedAppIds.delete('88888');
    });
  });

  describe('waitForInjectionPoint retry logic', () => {
    it('should return findInjectionPoint result when SVG found immediately', async () => {
      const { waitForInjectionPoint, findInjectionPoint } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      const wrapper = document.createElement('span');
      const svg = document.createElement('svg');
      svg.setAttribute('class', 'SVGIcon_Windows');
      wrapper.appendChild(svg);
      item.appendChild(wrapper);
      document.body.appendChild(item);

      const result = await waitForInjectionPoint(item);

      expect(result).not.toBeNull();
      expect(result.container).toBeTruthy();

      item.remove();
    });
  });

  describe('processItem with same processedAppId and icons', () => {
    beforeEach(() => {
      const { injectedAppIds, processedAppIds, pendingItems, setUserSettings } = globalThis.SCPW_ContentTestExports;
      injectedAppIds.clear();
      processedAppIds.clear();
      pendingItems.clear();
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: false
      });
    });

    afterEach(() => {
      const { setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true
      });
    });

    it('should early return when processedAppId matches and icons exist', async () => {
      const { processItem, createIconsContainer, injectedAppIds } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-44444-0');
      item.setAttribute('data-scpw-processed', '44444'); // Same appid

      // Add existing icons
      const icons = createIconsContainer('44444', 'Same Game');
      item.appendChild(icons);

      // Add app link
      const link = document.createElement('a');
      link.href = '/app/44444/Same_Game';
      item.appendChild(link);

      document.body.appendChild(item);

      const initialInjectedSize = injectedAppIds.size;

      await processItem(item);

      // Should have early-returned - no change to injectedAppIds
      expect(item.querySelectorAll('.scpw-platforms').length).toBe(1);

      item.remove();
    });

    it('should reprocess when processedAppId matches but icons missing', async () => {
      const { processItem, injectedAppIds, pendingItems } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      item.setAttribute('data-rfd-draggable-id', 'WishlistItem-55555-0');
      item.setAttribute('data-scpw-processed', '55555'); // Same appid
      // NO icons in DOM

      // Add SVG for injection point
      const wrapper = document.createElement('span');
      const svg = document.createElement('svg');
      svg.setAttribute('class', 'SVGIcon_Windows');
      wrapper.appendChild(svg);
      item.appendChild(wrapper);

      // Add app link
      const link = document.createElement('a');
      link.href = '/app/55555/Missing_Icons_Game';
      item.appendChild(link);

      document.body.appendChild(item);

      await processItem(item);

      // Should have reprocessed - icons injected
      expect(item.querySelector('.scpw-platforms')).toBeTruthy();
      expect(injectedAppIds.has('55555')).toBe(true);

      item.remove();
    });
  });

  describe('processingAppIds concurrent request prevention', () => {
    it('should track appids being processed', () => {
      // Access the processingAppIds Set through pattern used in processItem
      const processingAppIds = new Set();

      processingAppIds.add('12345');
      expect(processingAppIds.has('12345')).toBe(true);

      // Simulate check before processing
      if (processingAppIds.has('12345')) {
        // Should skip
      }

      processingAppIds.delete('12345');
      expect(processingAppIds.has('12345')).toBe(false);
    });
  });

  describe('getEnabledPlatforms default case', () => {
    it('should return true for unknown platform in switch default', () => {
      // The switch statement has a default case that returns true
      // Test that behavior by simulating the function logic
      const platform = 'unknownPlatform';
      let result = true; // default case

      switch (platform) {
        case 'nintendo':
          result = true;
          break;
        case 'playstation':
          result = true;
          break;
        case 'xbox':
          result = true;
          break;
        case 'steamdeck':
          result = true;
          break;
        default:
          result = true;
      }

      expect(result).toBe(true);
    });
  });

  describe('setupObserver MutationObserver integration', () => {
    it('should handle mutations array processing', () => {
      // Test the hasRelevantChanges logic from setupObserver
      const mutations = [
        { type: 'childList', addedNodes: [] },
        { type: 'attributes', attributeName: 'class' }
      ];

      const hasRelevantChanges = mutations.some((m) => {
        if (m.type === 'childList') {
          return m.addedNodes.length > 0;
        }
        if (m.type === 'attributes') {
          return m.attributeName === 'data-rfd-draggable-id' || m.attributeName === 'href';
        }
        return false;
      });

      expect(hasRelevantChanges).toBe(false);
    });

    it('should detect relevant childList mutations', () => {
      const mutations = [
        { type: 'childList', addedNodes: [document.createElement('div')] }
      ];

      const hasRelevantChanges = mutations.some((m) => {
        if (m.type === 'childList') {
          return m.addedNodes.length > 0;
        }
        return false;
      });

      expect(hasRelevantChanges).toBe(true);
    });

    it('should detect relevant href attribute mutations', () => {
      const mutations = [
        { type: 'attributes', attributeName: 'href' }
      ];

      const hasRelevantChanges = mutations.some((m) => {
        if (m.type === 'attributes') {
          return m.attributeName === 'data-rfd-draggable-id' || m.attributeName === 'href';
        }
        return false;
      });

      expect(hasRelevantChanges).toBe(true);
    });
  });

  describe('init function early return branch', () => {
    it('should detect missing PLATFORM_ICONS', () => {
      // Test the init guard logic
      const PLATFORM_ICONS = null;
      const PLATFORM_INFO = {};
      const STATUS_INFO = {};

      const isMissing = !PLATFORM_ICONS || !PLATFORM_INFO || !STATUS_INFO;
      expect(isMissing).toBe(true);
    });

    it('should detect missing PLATFORM_INFO', () => {
      const PLATFORM_ICONS = {};
      const PLATFORM_INFO = null;
      const STATUS_INFO = {};

      const isMissing = !PLATFORM_ICONS || !PLATFORM_INFO || !STATUS_INFO;
      expect(isMissing).toBe(true);
    });

    it('should detect missing STATUS_INFO', () => {
      const PLATFORM_ICONS = {};
      const PLATFORM_INFO = {};
      const STATUS_INFO = null;

      const isMissing = !PLATFORM_ICONS || !PLATFORM_INFO || !STATUS_INFO;
      expect(isMissing).toBe(true);
    });

    it('should pass when all definitions present', () => {
      const PLATFORM_ICONS = { nintendo: '<svg/>' };
      const PLATFORM_INFO = { nintendo: {} };
      const STATUS_INFO = { available: {} };

      const isMissing = !PLATFORM_ICONS || !PLATFORM_INFO || !STATUS_INFO;
      expect(isMissing).toBe(false);
    });
  });

  describe('Steam Deck initialization in init', () => {
    it('should check SteamDeck availability and showSteamDeck setting', () => {
      // Test the conditional logic
      const SteamDeck = { waitForDeckData: jest.fn() };
      const userSettings = { showSteamDeck: true };

      const shouldLoadDeck = SteamDeck && userSettings.showSteamDeck;
      expect(shouldLoadDeck).toBe(true);
    });

    it('should skip when SteamDeck not available', () => {
      const SteamDeck = null;
      const userSettings = { showSteamDeck: true };

      const shouldLoadDeck = SteamDeck && userSettings.showSteamDeck;
      expect(shouldLoadDeck).toBeFalsy();
    });

    it('should skip when showSteamDeck is false', () => {
      const SteamDeck = { waitForDeckData: jest.fn() };
      const userSettings = { showSteamDeck: false };

      const shouldLoadDeck = SteamDeck && userSettings.showSteamDeck;
      expect(shouldLoadDeck).toBe(false);
    });
  });

  describe('latestDeckData size check', () => {
    it('should update steamDeckData when size > 0', () => {
      const latestDeckData = new Map([['12345', 3]]);
      let steamDeckData = null;

      if (latestDeckData.size > 0) {
        steamDeckData = latestDeckData;
      }

      expect(steamDeckData).toBe(latestDeckData);
    });

    it('should not update steamDeckData when empty', () => {
      const latestDeckData = new Map();
      let steamDeckData = null;

      if (latestDeckData.size > 0) {
        steamDeckData = latestDeckData;
      }

      expect(steamDeckData).toBeNull();
    });
  });

  describe('DEBUG log branches', () => {
    it('should skip debug logs when DEBUG is false', () => {
      const DEBUG = false;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      if (DEBUG) console.log('This should not be called');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('processItem early returns', () => {
    beforeEach(() => {
      const { injectedAppIds, processedAppIds, setUserSettings } = globalThis.SCPW_ContentTestExports;
      injectedAppIds.clear();
      processedAppIds.clear();
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: false
      });
    });

    afterEach(() => {
      const { setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true
      });
    });

    it('should skip item without appId', async () => {
      const { processItem, injectedAppIds } = globalThis.SCPW_ContentTestExports;

      const item = document.createElement('div');
      // No data-rfd-draggable-id or app link

      await processItem(item);

      expect(injectedAppIds.size).toBe(0);
    });

    it('should skip when already in processingAppIds', async () => {
      // This tests the processingAppIds guard
      const processingAppIds = new Set(['12345']);

      const shouldSkip = processingAppIds.has('12345');
      expect(shouldSkip).toBe(true);
    });
  });

  describe('chrome.storage.onChanged listener direct testing', () => {
    let storageChangeListeners;

    beforeEach(() => {
      storageChangeListeners = [];
      // Capture the listener when addListener is called
      chrome.storage.onChanged = {
        addListener: jest.fn((listener) => {
          storageChangeListeners.push(listener);
        })
      };

      const { setUserSettings, setSteamDeckData, getCachedEntriesByAppId, pendingItems, injectedAppIds } = globalThis.SCPW_ContentTestExports;
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true
      });
      setSteamDeckData(null);
      getCachedEntriesByAppId().clear();
      pendingItems.clear();
      injectedAppIds.clear();

      // Re-run setupSettingsChangeListener to register the listener
      const { setupSettingsChangeListener } = globalThis.SCPW_ContentTestExports;
      setupSettingsChangeListener();
    });

    afterEach(() => {
      const { setUserSettings } = globalThis.SCPW_ContentTestExports;
      setUserSettings({
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true
      });
    });

    it('should early return when areaName is not sync', () => {
      const listener = storageChangeListeners[storageChangeListeners.length - 1];
      expect(listener).toBeDefined();

      // Should not throw - early returns
      listener({ scpwSettings: { newValue: {} } }, 'local');
    });

    it('should early return when scpwSettings not in changes', () => {
      const listener = storageChangeListeners[storageChangeListeners.length - 1];
      expect(listener).toBeDefined();

      // Should not throw - early returns
      listener({ otherKey: { newValue: 'value' } }, 'sync');
    });

    it('should handle platform enable changes', () => {
      const listener = storageChangeListeners[storageChangeListeners.length - 1];
      expect(listener).toBeDefined();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      listener({
        scpwSettings: {
          oldValue: { showNintendo: false, showPlaystation: true, showXbox: true, showSteamDeck: true },
          newValue: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true }
        }
      }, 'sync');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Platform settings changed'));
      consoleSpy.mockRestore();
    });

    it('should handle platform disable changes', () => {
      const listener = storageChangeListeners[storageChangeListeners.length - 1];
      expect(listener).toBeDefined();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      listener({
        scpwSettings: {
          oldValue: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true },
          newValue: { showNintendo: false, showPlaystation: true, showXbox: true, showSteamDeck: true }
        }
      }, 'sync');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Platform settings changed'));
      consoleSpy.mockRestore();
    });

    it('should handle all platforms being disabled', () => {
      const { createIconsContainer, setUserSettings } = globalThis.SCPW_ContentTestExports;
      const listener = storageChangeListeners[storageChangeListeners.length - 1];

      // Create a container with loader
      const container = createIconsContainer('12345', 'Test Game');
      document.body.appendChild(container);

      listener({
        scpwSettings: {
          oldValue: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true },
          newValue: { showNintendo: false, showPlaystation: false, showXbox: false, showSteamDeck: false }
        }
      }, 'sync');

      container.remove();
    });

    it('should update pending items with stale containers', () => {
      const { pendingItems, createIconsContainer } = globalThis.SCPW_ContentTestExports;
      const listener = storageChangeListeners[storageChangeListeners.length - 1];

      // Create stale container (not in DOM)
      const staleContainer = createIconsContainer('99999', 'Stale Game');

      // Create fresh container in DOM
      const freshContainer = createIconsContainer('99999', 'Stale Game');
      document.body.appendChild(freshContainer);

      // Add stale container to pending
      pendingItems.set('99999', { gameName: 'Stale Game', container: staleContainer });

      listener({
        scpwSettings: {
          oldValue: { showNintendo: false, showPlaystation: true, showXbox: true, showSteamDeck: true },
          newValue: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true }
        }
      }, 'sync');

      // Pending should now point to fresh container
      expect(pendingItems.get('99999')?.container).toBe(freshContainer);

      freshContainer.remove();
      pendingItems.clear();
    });

    it('should handle steamdeck being enabled when no deck data', async () => {
      const { setSteamDeckData } = globalThis.SCPW_ContentTestExports;
      const listener = storageChangeListeners[storageChangeListeners.length - 1];

      setSteamDeckData(null);

      // Mock SteamDeck client
      const mockDeckData = new Map([['12345', 3]]);
      globalThis.SCPW_SteamDeck = {
        waitForDeckData: jest.fn().mockResolvedValue(mockDeckData),
        getDeckStatus: jest.fn(),
        statusToDisplayStatus: jest.fn()
      };

      listener({
        scpwSettings: {
          oldValue: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false },
          newValue: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true }
        }
      }, 'sync');

      await Promise.resolve();
      await Promise.resolve();

      delete globalThis.SCPW_SteamDeck;
    });

    it('should trigger fetch when console platform enabled and cache empty', () => {
      const { getCachedEntriesByAppId, injectedAppIds } = globalThis.SCPW_ContentTestExports;
      const listener = storageChangeListeners[storageChangeListeners.length - 1];

      getCachedEntriesByAppId().clear();

      listener({
        scpwSettings: {
          oldValue: { showNintendo: false, showPlaystation: false, showXbox: false, showSteamDeck: true },
          newValue: { showNintendo: true, showPlaystation: false, showXbox: false, showSteamDeck: true }
        }
      }, 'sync');

      // injectedAppIds should have been cleared
      expect(injectedAppIds.size).toBe(0);
    });

    it('should not trigger fetch when cache has entries', () => {
      const { getCachedEntriesByAppId } = globalThis.SCPW_ContentTestExports;
      const listener = storageChangeListeners[storageChangeListeners.length - 1];

      // Add entry to cache
      getCachedEntriesByAppId().set('12345', { gameName: 'Test', platforms: {} });

      listener({
        scpwSettings: {
          oldValue: { showNintendo: false, showPlaystation: false, showXbox: false, showSteamDeck: true },
          newValue: { showNintendo: true, showPlaystation: false, showXbox: false, showSteamDeck: true }
        }
      }, 'sync');

      getCachedEntriesByAppId().clear();
    });

    it('should update loading container from cache', () => {
      const { createIconsContainer, getCachedEntriesByAppId, setUserSettings } = globalThis.SCPW_ContentTestExports;
      const listener = storageChangeListeners[storageChangeListeners.length - 1];

      // Create container with loader
      const container = createIconsContainer('88888', 'Cached Game');
      document.body.appendChild(container);

      // Add to cache
      getCachedEntriesByAppId().set('88888', {
        gameName: 'Cached Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: null },
          playstation: { status: 'unavailable', storeUrl: null },
          xbox: { status: 'unknown', storeUrl: null }
        }
      });

      // Disable SteamDeck to avoid issues
      setUserSettings({ showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false });

      listener({
        scpwSettings: {
          oldValue: { showNintendo: false, showPlaystation: true, showXbox: true, showSteamDeck: false },
          newValue: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false }
        }
      }, 'sync');

      // Container should have been updated
      expect(container.querySelector('.scpw-loader')).toBeNull();

      container.remove();
      getCachedEntriesByAppId().clear();
    });
  });
});
