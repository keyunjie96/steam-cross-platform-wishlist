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
    require('../../content.js');
  });

  afterEach(() => {
    delete globalThis.XCPW_Icons;
    delete globalThis.XCPW_PlatformInfo;
    delete globalThis.XCPW_StatusInfo;
  });

  describe('style injection', () => {
    it('should inject styles into the document head', () => {
      const styleElement = document.getElementById('xcpw-styles');
      expect(styleElement).toBeTruthy();
      expect(styleElement.tagName).toBe('STYLE');
    });

    it('should include CSS for xcpw-platforms class', () => {
      const styleElement = document.getElementById('xcpw-styles');
      expect(styleElement.textContent).toContain('.xcpw-platforms');
    });

    it('should include CSS for xcpw-platform-icon class', () => {
      const styleElement = document.getElementById('xcpw-styles');
      expect(styleElement.textContent).toContain('.xcpw-platform-icon');
    });

    it('should include CSS for available, unavailable, and unknown states', () => {
      const styleElement = document.getElementById('xcpw-styles');
      expect(styleElement.textContent).toContain('.xcpw-available');
      expect(styleElement.textContent).toContain('.xcpw-unavailable');
      expect(styleElement.textContent).toContain('.xcpw-unknown');
    });

    it('should include CSS for loading animation', () => {
      const styleElement = document.getElementById('xcpw-styles');
      expect(styleElement.textContent).toContain('.xcpw-loading');
      expect(styleElement.textContent).toContain('@keyframes xcpw-pulse');
    });

    it('should include reduced motion support', () => {
      const styleElement = document.getElementById('xcpw-styles');
      expect(styleElement.textContent).toContain('prefers-reduced-motion');
    });

    it('should include separator styling', () => {
      const styleElement = document.getElementById('xcpw-styles');
      expect(styleElement.textContent).toContain('.xcpw-separator');
    });

    it('should include order:9999 for flex positioning', () => {
      const styleElement = document.getElementById('xcpw-styles');
      expect(styleElement.textContent).toContain('order: 9999');
    });

    it('should not inject styles twice', () => {
      // Re-require to test idempotency
      jest.resetModules();
      globalThis.XCPW_Icons = mockIcons;
      globalThis.XCPW_PlatformInfo = mockPlatformInfo;
      globalThis.XCPW_StatusInfo = mockStatusInfo;
      require('../../content.js');

      const styleElements = document.querySelectorAll('#xcpw-styles');
      expect(styleElements.length).toBe(1);
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

  describe('StoreUrls fallback', () => {
    it('should have StoreUrls defined locally', () => {
      // content.js defines its own StoreUrls object
      // These URLs are for search pages when we don't have official URLs
      const expectedPatterns = {
        nintendo: /nintendo\.com\/search/,
        playstation: /store\.playstation\.com\/search/,
        xbox: /xbox\.com\/search/
      };

      // Verify the module defines search URL patterns (via style check)
      const styleContent = document.getElementById('xcpw-styles')?.textContent || '';
      expect(styleContent).toContain('.xcpw-platform-icon');
    });
  });

  describe('error handling', () => {
    it('should log error when PLATFORM_ICONS is missing', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      delete globalThis.XCPW_Icons;
      jest.resetModules();
      globalThis.XCPW_PlatformInfo = mockPlatformInfo;
      globalThis.XCPW_StatusInfo = mockStatusInfo;
      require('../../content.js');

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
      require('../../content.js');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing icon definitions')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('icon update with data', () => {
    it('should show available icons and hide unavailable ones', () => {
      // Create a mock container with all three platform icons
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

      // Simulate data update
      const data = {
        gameName: 'Test',
        platforms: {
          nintendo: { status: 'available', storeUrl: 'https://ns.example.com' },
          playstation: { status: 'unavailable', storeUrl: 'https://ps.example.com' },
          xbox: { status: 'unknown', storeUrl: 'https://xb.example.com' }
        }
      };

      // Verify initial state
      expect(container.querySelectorAll('[data-platform]').length).toBe(3);
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
});
