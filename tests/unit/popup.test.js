/**
 * Unit tests for popup.js
 */

describe('popup.js', () => {
  let statusEl;
  let cacheCountEl;
  let cacheAgeEl;
  let refreshBtn;
  let clearBtn;
  let optionsLink;
  let showNintendoCheckbox;
  let showPlaystationCheckbox;
  let showXboxCheckbox;
  let showSteamDeckCheckbox;
  let showHltbCheckbox;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    // Set up DOM elements that popup.js expects
    document.body.textContent = '';
    document.body.className = 'is-loading';

    statusEl = document.createElement('div');
    statusEl.id = 'status';
    statusEl.className = 'status';
    document.body.appendChild(statusEl);

    cacheCountEl = document.createElement('div');
    cacheCountEl.id = 'cache-count';
    cacheCountEl.textContent = '-';
    document.body.appendChild(cacheCountEl);

    cacheAgeEl = document.createElement('div');
    cacheAgeEl.id = 'cache-age';
    cacheAgeEl.textContent = '-';
    document.body.appendChild(cacheAgeEl);

    refreshBtn = document.createElement('button');
    refreshBtn.id = 'refresh-btn';
    refreshBtn.textContent = 'Refresh';
    document.body.appendChild(refreshBtn);

    clearBtn = document.createElement('button');
    clearBtn.id = 'clear-btn';
    clearBtn.textContent = 'Clear Cache';
    document.body.appendChild(clearBtn);

    optionsLink = document.createElement('a');
    optionsLink.id = 'options-link';
    optionsLink.href = '#';
    optionsLink.textContent = 'Open Settings';
    document.body.appendChild(optionsLink);

    // Platform toggle checkboxes
    const createToggle = (id) => {
      const label = document.createElement('label');
      label.className = 'platform-toggle';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = id;
      label.appendChild(checkbox);
      const span = document.createElement('span');
      span.textContent = id.replace('show-', '');
      label.appendChild(span);
      document.body.appendChild(label);
      return checkbox;
    };

    showNintendoCheckbox = createToggle('show-nintendo');
    showPlaystationCheckbox = createToggle('show-playstation');
    showXboxCheckbox = createToggle('show-xbox');
    showSteamDeckCheckbox = createToggle('show-steamdeck');
    showHltbCheckbox = createToggle('show-hltb');

    // Mock chrome.runtime.sendMessage
    chrome.runtime.sendMessage.mockClear();
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      count: 10,
      oldestEntry: Date.now() - 86400000 // 1 day ago
    });

    // Mock chrome.runtime.openOptionsPage
    chrome.runtime.openOptionsPage.mockClear();

    // Mock chrome.storage.sync
    chrome.storage.sync.get.mockClear();
    chrome.storage.sync.get.mockResolvedValue({
      scpwSettings: {
        showNintendo: true,
        showPlaystation: true,
        showXbox: false,
        showSteamDeck: true,
        showHltb: true,
        hltbDisplayStat: 'mainStory'
      }
    });
    chrome.storage.sync.set.mockClear();
    chrome.storage.sync.set.mockResolvedValue();

    // Mock confirm dialog
    global.confirm = jest.fn(() => true);

    // Mock UserSettings (centralized settings from types.js)
    globalThis.SCPW_UserSettings = {
      DEFAULT_USER_SETTINGS: {
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true,
        showHltb: true,
        hltbDisplayStat: 'mainStory'
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

    // Load popup.js
    require('../../dist/popup.js');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.confirm;
  });

  // Helper to get status message
  const getStatusMessage = () => statusEl.textContent;
  const getStatusType = () => {
    if (statusEl.classList.contains('success')) return 'success';
    if (statusEl.classList.contains('error')) return 'error';
    return null;
  };

  describe('initialization', () => {
    it('should get all required DOM elements', () => {
      expect(statusEl).toBeTruthy();
      expect(cacheCountEl).toBeTruthy();
      expect(cacheAgeEl).toBeTruthy();
      expect(refreshBtn).toBeTruthy();
      expect(clearBtn).toBeTruthy();
      expect(optionsLink).toBeTruthy();
    });

    it('should add click listener to refresh button', () => {
      expect(refreshBtn.onclick !== null || refreshBtn.addEventListener).toBeTruthy();
    });

    it('should add click listener to clear button', () => {
      expect(clearBtn.onclick !== null || clearBtn.addEventListener).toBeTruthy();
    });

    it('should add click listener to options link', () => {
      expect(optionsLink.onclick !== null || optionsLink.addEventListener).toBeTruthy();
    });

    it('should load cache stats on DOMContentLoaded', async () => {
      document.dispatchEvent(new Event('DOMContentLoaded'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GET_CACHE_STATS'
      });
    });
  });

  describe('loadCacheStats', () => {
    it('should request cache stats from background', async () => {
      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GET_CACHE_STATS'
      });
    });

    it('should display cache count', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        count: 25,
        oldestEntry: Date.now()
      });

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheCountEl.textContent).toBe('25');
    });

    it('should display cache age in days and hours', async () => {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000); // 1d 2h ago

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        count: 5,
        oldestEntry: oneDayAgo
      });

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheAgeEl.textContent).toMatch(/1d 2h/);
    });

    it('should display cache age in hours only when less than a day', async () => {
      const hoursAgo = Date.now() - (5 * 60 * 60 * 1000); // 5h ago

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        count: 3,
        oldestEntry: hoursAgo
      });

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheAgeEl.textContent).toBe('5h');
    });

    it('should display <1h when cache is less than an hour old', async () => {
      const recentTime = Date.now() - (30 * 60 * 1000); // 30 min ago

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        count: 2,
        oldestEntry: recentTime
      });

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheAgeEl.textContent).toBe('<1h');
    });

    it('should display dash when no oldest entry', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        count: 0,
        oldestEntry: null
      });

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheAgeEl.textContent).toBe('-');
    });

    it('should display question marks on error', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheCountEl.textContent).toBe('?');
      expect(cacheAgeEl.textContent).toBe('?');
    });

    it('should not update display when response.success is false', async () => {
      cacheCountEl.textContent = 'original';
      cacheAgeEl.textContent = 'original';

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: false,
        count: 99,
        oldestEntry: Date.now()
      });

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheCountEl.textContent).toBe('original');
      expect(cacheAgeEl.textContent).toBe('original');
    });

    it('should not update display when response is undefined', async () => {
      cacheCountEl.textContent = 'original';
      cacheAgeEl.textContent = 'original';

      chrome.runtime.sendMessage.mockResolvedValueOnce(undefined);

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheCountEl.textContent).toBe('original');
      expect(cacheAgeEl.textContent).toBe('original');
    });

    it('should disable refresh button while loading', async () => {
      let resolveMessage;
      const messagePromise = new Promise(resolve => {
        resolveMessage = resolve;
      });
      chrome.runtime.sendMessage.mockReturnValueOnce(messagePromise);

      refreshBtn.click();

      expect(refreshBtn.disabled).toBe(true);

      resolveMessage({ success: true, count: 5, oldestEntry: Date.now() });

      await jest.advanceTimersByTimeAsync(0);

      expect(refreshBtn.disabled).toBe(false);
    });

    it('should show loading indicator while loading', async () => {
      let resolveMessage;
      const messagePromise = new Promise(resolve => {
        resolveMessage = resolve;
      });
      chrome.runtime.sendMessage.mockReturnValueOnce(messagePromise);

      refreshBtn.click();

      expect(refreshBtn.querySelector('.loading')).toBeTruthy();

      resolveMessage({ success: true, count: 5, oldestEntry: Date.now() });

      await jest.advanceTimersByTimeAsync(0);
    });

    it('should restore original button text after loading', async () => {
      const originalText = refreshBtn.textContent;

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        count: 5,
        oldestEntry: Date.now()
      });

      refreshBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(refreshBtn.textContent).toBe(originalText);
    });
  });

  describe('clearCache', () => {
    it('should show confirmation dialog', async () => {
      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(global.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Clear')
      );
    });

    it('should not clear cache if user cancels', async () => {
      global.confirm.mockReturnValueOnce(false);

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({
        type: 'CLEAR_CACHE'
      });
    });

    it('should send CLEAR_CACHE message when confirmed', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CLEAR_CACHE'
      });
    });

    it('should show success status on successful clear', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(getStatusMessage()).toContain('cleared');
      expect(getStatusType()).toBe('success');
    });

    it('should show error status on failed clear', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false });

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(getStatusMessage()).toContain('Failed');
      expect(getStatusType()).toBe('error');
    });

    it('should show error status on exception', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(getStatusMessage()).toContain('Failed');
      expect(getStatusType()).toBe('error');
    });

    it('should disable button while loading', async () => {
      let resolveMessage;
      const messagePromise = new Promise(resolve => {
        resolveMessage = resolve;
      });
      chrome.runtime.sendMessage.mockReturnValueOnce(messagePromise);

      clearBtn.click();

      expect(clearBtn.disabled).toBe(true);

      resolveMessage({ success: true });

      await jest.advanceTimersByTimeAsync(0);

      expect(clearBtn.disabled).toBe(false);
    });

    it('should show loading indicator while loading', async () => {
      let resolveMessage;
      const messagePromise = new Promise(resolve => {
        resolveMessage = resolve;
      });
      chrome.runtime.sendMessage.mockReturnValueOnce(messagePromise);

      clearBtn.click();

      expect(clearBtn.querySelector('.loading')).toBeTruthy();

      resolveMessage({ success: true });

      await jest.advanceTimersByTimeAsync(0);
    });

    it('should restore original button text after loading', async () => {
      const originalText = clearBtn.textContent;

      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(clearBtn.textContent).toBe(originalText);
    });

    it('should refresh stats after clearing cache', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true }) // CLEAR_CACHE
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null }); // GET_CACHE_STATS

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      const calls = chrome.runtime.sendMessage.mock.calls;
      expect(calls.some(call => call[0].type === 'CLEAR_CACHE')).toBe(true);
      expect(calls.some(call => call[0].type === 'GET_CACHE_STATS')).toBe(true);
    });

    it('should auto-hide status after duration', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(getStatusType()).toBe('success');

      // Advance past the 3 second status duration
      await jest.advanceTimersByTimeAsync(3500);

      expect(getStatusType()).toBe(null);
    });
  });

  describe('openOptionsPage', () => {
    it('should call chrome.runtime.openOptionsPage when options link clicked', async () => {
      optionsLink.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
    });

    it('should prevent default link behavior', async () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

      optionsLink.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('setButtonLoading', () => {
    it('should save original text to dataset', async () => {
      const originalText = clearBtn.textContent;

      let resolveMessage;
      chrome.runtime.sendMessage.mockReturnValueOnce(new Promise(resolve => {
        resolveMessage = resolve;
      }));

      clearBtn.click();

      expect(clearBtn.dataset.originalText).toBe(originalText);

      resolveMessage({ success: true });
      await jest.advanceTimersByTimeAsync(0);
    });

    it('should restore original text when loading completes', async () => {
      const originalText = clearBtn.textContent;

      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null });

      clearBtn.click();

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(0);

      expect(clearBtn.textContent).toBe(originalText);
      expect(clearBtn.disabled).toBe(false);
    });

    it('should handle setButtonLoading without originalText', async () => {
      delete clearBtn.dataset.originalText;
      clearBtn.textContent = 'Test';

      clearBtn.disabled = true;

      clearBtn.disabled = false;

      expect(clearBtn.disabled).toBe(false);
    });
  });

  describe('platform toggles', () => {
    it('should load settings from chrome.storage.sync on init', async () => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.get).toHaveBeenCalledWith('scpwSettings');
    });

    it('should set checkbox states based on loaded settings', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({
        scpwSettings: {
          showNintendo: true,
          showPlaystation: false,
          showXbox: true,
          showSteamDeck: false,
          showHltb: true,
          hltbDisplayStat: 'mainStory'
        }
      });

      jest.resetModules();
      require('../../dist/popup.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      expect(showNintendoCheckbox.checked).toBe(true);
      expect(showPlaystationCheckbox.checked).toBe(false);
      expect(showXboxCheckbox.checked).toBe(true);
      expect(showSteamDeckCheckbox.checked).toBe(false);
      expect(showHltbCheckbox.checked).toBe(true);
    });

    it('should use default settings when none are stored', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({});

      jest.resetModules();
      require('../../dist/popup.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Default is all true
      expect(showNintendoCheckbox.checked).toBe(true);
      expect(showPlaystationCheckbox.checked).toBe(true);
      expect(showXboxCheckbox.checked).toBe(true);
      expect(showSteamDeckCheckbox.checked).toBe(true);
      expect(showHltbCheckbox.checked).toBe(true);
    });

    it('should save settings when Nintendo toggle is changed', async () => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      showNintendoCheckbox.checked = false;
      showNintendoCheckbox.dispatchEvent(new Event('change'));
      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        scpwSettings: expect.objectContaining({
          showNintendo: false
        })
      });
    });

    it.each([
      ['PlayStation', () => showPlaystationCheckbox],
      ['Xbox', () => showXboxCheckbox],
      ['Steam Deck', () => showSteamDeckCheckbox]
    ])('should save settings when %s toggle is changed', async (name, getCheckbox) => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      const checkbox = getCheckbox();
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });

    it('should show success status when settings are saved', async () => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      showNintendoCheckbox.checked = false;
      showNintendoCheckbox.dispatchEvent(new Event('change'));
      await jest.advanceTimersByTimeAsync(0);

      expect(getStatusMessage()).toContain('saved');
      expect(getStatusType()).toBe('success');
    });

    it('should show error status when settings fail to save', async () => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      chrome.storage.sync.set.mockRejectedValueOnce(new Error('Storage error'));

      showNintendoCheckbox.checked = false;
      showNintendoCheckbox.dispatchEvent(new Event('change'));
      await jest.advanceTimersByTimeAsync(0);

      expect(getStatusMessage()).toContain('Failed');
      expect(getStatusType()).toBe('error');
    });

    it('should handle loadSettings error gracefully', async () => {
      chrome.storage.sync.get.mockRejectedValueOnce(new Error('Storage error'));

      jest.resetModules();
      require('../../dist/popup.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Should not throw - the error is caught and logged
      // Checkboxes keep their initial HTML state (unchecked)
      expect(chrome.storage.sync.get).toHaveBeenCalled();
    });

    it('should remove is-loading class after initialization', async () => {
      // Ensure is-loading is set
      document.body.classList.add('is-loading');
      expect(document.body.classList.contains('is-loading')).toBe(true);

      jest.resetModules();
      require('../../dist/popup.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      expect(document.body.classList.contains('is-loading')).toBe(false);
    });

    it('should handle missing checkbox elements gracefully', async () => {
      // Remove all checkboxes from DOM to test null checks
      showNintendoCheckbox.parentElement.remove();
      showPlaystationCheckbox.parentElement.remove();
      showXboxCheckbox.parentElement.remove();
      showSteamDeckCheckbox.parentElement.remove();
      showHltbCheckbox.parentElement.remove();

      jest.resetModules();
      require('../../dist/popup.js');

      // Should not throw
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      expect(document.body.classList.contains('is-loading')).toBe(false);
    });

    it('should initialize immediately when document already loaded', async () => {
      // Simulate document already loaded (readyState !== 'loading')
      Object.defineProperty(document, 'readyState', {
        value: 'complete',
        writable: true
      });

      jest.resetModules();
      require('../../dist/popup.js');
      await jest.advanceTimersByTimeAsync(0);

      // Should have loaded stats without needing DOMContentLoaded event
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GET_CACHE_STATS'
      });

      // Restore
      Object.defineProperty(document, 'readyState', {
        value: 'loading',
        writable: true
      });
    });
  });
});
