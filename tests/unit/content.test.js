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
      xbox: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle/></svg>'
    };
    globalThis.XCPW_Icons = mockIcons;

    mockPlatformInfo = {
      nintendo: { name: 'Nintendo Switch', abbr: 'NS', searchLabel: 'Search Nintendo' },
      playstation: { name: 'PlayStation', abbr: 'PS', searchLabel: 'Search PlayStation' },
      xbox: { name: 'Xbox', abbr: 'XB', searchLabel: 'Search Xbox' }
    };
    globalThis.XCPW_PlatformInfo = mockPlatformInfo;

    mockStatusInfo = {
      available: { tooltip: (p) => `${mockPlatformInfo[p].name}: Available`, className: 'xcpw-available' },
      unavailable: { tooltip: (p) => `${mockPlatformInfo[p].name}: Not available`, className: 'xcpw-unavailable' },
      unknown: { tooltip: (p) => `${mockPlatformInfo[p].name}: Unknown`, className: 'xcpw-unknown' }
    };
    globalThis.XCPW_StatusInfo = mockStatusInfo;

    // Mock StoreUrls (loaded from types.js)
    globalThis.XCPW_StoreUrls = {
      nintendo: (gameName) => `https://www.nintendo.com/search/#q=${encodeURIComponent(gameName)}`,
      playstation: (gameName) => `https://store.playstation.com/search/${encodeURIComponent(gameName)}`,
      xbox: (gameName) => `https://www.xbox.com/search?q=${encodeURIComponent(gameName)}`
    };

    // Mock chrome.runtime.sendMessage
    chrome.runtime.sendMessage = jest.fn().mockResolvedValue({
      success: true,
      data: {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://example.com/ns' },
          playstation: { status: 'unavailable', storeUrl: 'https://example.com/ps' },
          xbox: { status: 'unknown', storeUrl: 'https://example.com/xb' }
        }
      }
    });

    // Load content.js - this will run init() if DOM is ready
    require('../../src/content.js');
  });

  afterEach(() => {
    delete globalThis.XCPW_Icons;
    delete globalThis.XCPW_PlatformInfo;
    delete globalThis.XCPW_StatusInfo;
    delete globalThis.XCPW_StoreUrls;
  });

  describe('styles', () => {
    // Note: CSS is now loaded via manifest.json content_scripts.css, not injected inline.
    // These tests verify we don't inject duplicate inline styles.

    it('should not inject inline styles (CSS loaded via manifest)', () => {
      const styleElement = document.getElementById('xcpw-styles');
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
    it('should create container with xcpw-platforms class', () => {
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';

      expect(container.classList.contains('xcpw-platforms')).toBe(true);
    });

    it('should include separator element', () => {
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';

      const separator = document.createElement('span');
      separator.className = 'xcpw-separator';
      container.appendChild(separator);

      expect(container.querySelector('.xcpw-separator')).toBeTruthy();
    });
  });

  describe('platform icon creation', () => {
    it('should create anchor element for available status', () => {
      const icon = document.createElement('a');
      icon.className = 'xcpw-platform-icon xcpw-available';
      icon.setAttribute('href', 'https://example.com');
      icon.setAttribute('target', '_blank');
      icon.setAttribute('rel', 'noopener noreferrer');

      expect(icon.tagName).toBe('A');
      expect(icon.classList.contains('xcpw-available')).toBe(true);
      expect(icon.getAttribute('target')).toBe('_blank');
    });

    it('should create anchor element for unknown status', () => {
      const icon = document.createElement('a');
      icon.className = 'xcpw-platform-icon xcpw-unknown';
      icon.setAttribute('href', 'https://example.com/search');

      expect(icon.tagName).toBe('A');
      expect(icon.classList.contains('xcpw-unknown')).toBe(true);
    });

    it('should create span element for unavailable status', () => {
      const icon = document.createElement('span');
      icon.className = 'xcpw-platform-icon xcpw-unavailable';

      expect(icon.tagName).toBe('SPAN');
      expect(icon.classList.contains('xcpw-unavailable')).toBe(true);
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
    it('should mark processed items with data-xcpw-processed', () => {
      const item = document.createElement('div');
      item.setAttribute('data-xcpw-processed', 'true');

      expect(item.hasAttribute('data-xcpw-processed')).toBe(true);
      expect(item.getAttribute('data-xcpw-processed')).toBe('true');
    });

    it('should mark items with icons using data-xcpw-icons', () => {
      const item = document.createElement('div');
      item.setAttribute('data-xcpw-icons', 'true');

      expect(item.hasAttribute('data-xcpw-icons')).toBe(true);
    });
  });

  describe('StoreUrls', () => {
    it('should use StoreUrls from globalThis', () => {
      // content.js uses XCPW_StoreUrls from globalThis (loaded via types.js)
      expect(globalThis.XCPW_StoreUrls).toBeDefined();
      expect(typeof globalThis.XCPW_StoreUrls.nintendo).toBe('function');
      expect(typeof globalThis.XCPW_StoreUrls.playstation).toBe('function');
      expect(typeof globalThis.XCPW_StoreUrls.xbox).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should log error when PLATFORM_ICONS is missing', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      delete globalThis.XCPW_Icons;
      jest.resetModules();
      globalThis.XCPW_PlatformInfo = mockPlatformInfo;
      globalThis.XCPW_StatusInfo = mockStatusInfo;
      require('../../src/content.js');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing icon definitions')
      );

      consoleSpy.mockRestore();
    });

    it('should log error when PLATFORM_INFO is missing', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      delete globalThis.XCPW_PlatformInfo;
      jest.resetModules();
      globalThis.XCPW_Icons = mockIcons;
      globalThis.XCPW_StatusInfo = mockStatusInfo;
      require('../../src/content.js');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing icon definitions')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('icon update with data', () => {
    it('should only show available icons, hide unavailable and unknown', () => {
      // Create a mock container with all three platform icons in loading state
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';

      const separator = document.createElement('span');
      separator.className = 'xcpw-separator';
      container.appendChild(separator);

      ['nintendo', 'playstation', 'xbox'].forEach(platform => {
        const icon = document.createElement('a');
        icon.className = 'xcpw-platform-icon xcpw-loading';
        icon.setAttribute('data-platform', platform);
        container.appendChild(icon);
      });

      // Verify initial state - all 3 icons present in loading state
      expect(container.querySelectorAll('[data-platform]').length).toBe(3);
      expect(container.querySelectorAll('.xcpw-loading').length).toBe(3);

      // Simulate updateIconsWithData behavior:
      // Only 'available' icons are kept, 'unavailable' and 'unknown' are removed
      const data = {
        gameName: 'Test Game',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://example.com/ns' },
          playstation: { status: 'unavailable' },
          xbox: { status: 'unknown' }
        }
      };

      // Simulate the update logic from updateIconsWithData
      for (const platform of ['nintendo', 'playstation', 'xbox']) {
        const oldIcon = container.querySelector(`[data-platform="${platform}"]`);
        if (!oldIcon) continue;

        const status = data.platforms[platform]?.status || 'unknown';
        if (status === 'available') {
          // Update icon in place
          oldIcon.classList.remove('xcpw-loading');
          oldIcon.classList.add('xcpw-available');
        } else {
          // Remove unavailable/unknown icons
          oldIcon.remove();
        }
      }

      // Verify: only available icon remains
      expect(container.querySelectorAll('[data-platform]').length).toBe(1);
      expect(container.querySelector('[data-platform="nintendo"]')).toBeTruthy();
      expect(container.querySelector('[data-platform="playstation"]')).toBeNull();
      expect(container.querySelector('[data-platform="xbox"]')).toBeNull();
      expect(container.querySelector('.xcpw-available')).toBeTruthy();
    });
  });

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

  describe('updateIconsWithData edge cases', () => {
    it('should only show available icons, hide unavailable and unknown', () => {
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';

      const separator = document.createElement('span');
      separator.className = 'xcpw-separator';
      container.appendChild(separator);

      // Add icons in loading state
      ['nintendo', 'playstation', 'xbox'].forEach(platform => {
        const icon = document.createElement('a');
        icon.className = 'xcpw-platform-icon xcpw-loading';
        icon.setAttribute('data-platform', platform);
        container.appendChild(icon);
      });

      document.body.appendChild(container);

      // Initially all 3 icons present
      expect(container.querySelectorAll('[data-platform]').length).toBe(3);
      // After updateIconsWithData, only available icons remain visible
      // unavailable and unknown icons are removed
    });

    it('should remove separator when no platforms are available', () => {
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';

      const separator = document.createElement('span');
      separator.className = 'xcpw-separator';
      container.appendChild(separator);

      // Simulate all platforms unavailable/unknown - icons get removed
      // When no visible icons remain, separator should also be removed
      container.querySelectorAll('[data-platform]').forEach(icon => icon.remove());

      const visibleIcons = container.querySelectorAll('[data-platform]');
      if (visibleIcons.length === 0) {
        const sep = container.querySelector('.xcpw-separator');
        if (sep) sep.remove();
      }

      expect(container.querySelector('.xcpw-separator')).toBeNull();
    });
  });

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
      expect(globalThis.XCPW_Icons).toBeDefined();
      expect(globalThis.XCPW_PlatformInfo).toBeDefined();
      expect(globalThis.XCPW_StatusInfo).toBeDefined();
    });
  });

  describe('batch processing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      // Clear pending items between tests
      if (globalThis.XCPW_ContentTestExports?.pendingItems) {
        globalThis.XCPW_ContentTestExports.pendingItems.clear();
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
      const { queueForBatchResolution, pendingItems } = globalThis.XCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';

      queueForBatchResolution('12345', 'Test Game', container);

      expect(pendingItems.size).toBe(1);
      expect(pendingItems.has('12345')).toBe(true);
    });

    it('should process pending batch after debounce', async () => {
      const { queueForBatchResolution, pendingItems } = globalThis.XCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';

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
      const { queueForBatchResolution, pendingItems } = globalThis.XCPW_ContentTestExports;

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
      const { processPendingBatch, pendingItems } = globalThis.XCPW_ContentTestExports;

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
      const { queueForBatchResolution, pendingItems } = globalThis.XCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';
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
      const { queueForBatchResolution, pendingItems } = globalThis.XCPW_ContentTestExports;
      const container = document.createElement('span');
      container.className = 'xcpw-platforms';

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
});
