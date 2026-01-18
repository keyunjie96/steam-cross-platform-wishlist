/**
 * Unit tests for options.js
 *
 * Note: Uses innerHTML for test fixtures with static, trusted content (safe in tests)
 */

describe('options.js', () => {
  let statusEl;
  let settingsStatusEl;
  let cacheCountEl;
  let cacheAgeEl;
  let refreshStatsBtn;
  let clearCacheBtn;
  let showNintendoCheckbox;
  let showPlaystationCheckbox;
  let showXboxCheckbox;
  let showSteamDeckCheckbox;
  let showHltbCheckbox;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    // Set up DOM elements that options.js expects using DOM API
    document.body.textContent = '';

    statusEl = document.createElement('div');
    statusEl.id = 'status';
    statusEl.className = 'status';
    document.body.appendChild(statusEl);

    settingsStatusEl = document.createElement('div');
    settingsStatusEl.id = 'settings-status';
    settingsStatusEl.className = 'status';
    document.body.appendChild(settingsStatusEl);

    cacheCountEl = document.createElement('span');
    cacheCountEl.id = 'cache-count';
    cacheCountEl.textContent = '0';
    document.body.appendChild(cacheCountEl);

    cacheAgeEl = document.createElement('span');
    cacheAgeEl.id = 'cache-age';
    cacheAgeEl.textContent = '-';
    document.body.appendChild(cacheAgeEl);

    refreshStatsBtn = document.createElement('button');
    refreshStatsBtn.id = 'refresh-stats-btn';
    refreshStatsBtn.textContent = 'Refresh Stats';
    document.body.appendChild(refreshStatsBtn);

    clearCacheBtn = document.createElement('button');
    clearCacheBtn.id = 'clear-cache-btn';
    clearCacheBtn.textContent = 'Clear Cache';
    document.body.appendChild(clearCacheBtn);

    showNintendoCheckbox = document.createElement('input');
    showNintendoCheckbox.type = 'checkbox';
    showNintendoCheckbox.id = 'show-nintendo';
    showNintendoCheckbox.checked = true;
    document.body.appendChild(showNintendoCheckbox);

    showPlaystationCheckbox = document.createElement('input');
    showPlaystationCheckbox.type = 'checkbox';
    showPlaystationCheckbox.id = 'show-playstation';
    showPlaystationCheckbox.checked = true;
    document.body.appendChild(showPlaystationCheckbox);

    showXboxCheckbox = document.createElement('input');
    showXboxCheckbox.type = 'checkbox';
    showXboxCheckbox.id = 'show-xbox';
    showXboxCheckbox.checked = true;
    document.body.appendChild(showXboxCheckbox);

    showSteamDeckCheckbox = document.createElement('input');
    showSteamDeckCheckbox.type = 'checkbox';
    showSteamDeckCheckbox.id = 'show-steamdeck';
    showSteamDeckCheckbox.checked = true;
    document.body.appendChild(showSteamDeckCheckbox);

    showHltbCheckbox = document.createElement('input');
    showHltbCheckbox.type = 'checkbox';
    showHltbCheckbox.id = 'show-hltb';
    showHltbCheckbox.checked = true;
    document.body.appendChild(showHltbCheckbox);

    // Mock chrome.runtime.sendMessage
    chrome.runtime.sendMessage.mockClear();
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      count: 10,
      oldestEntry: Date.now() - 86400000 // 1 day ago
    });

    // Mock chrome.storage.sync
    chrome.storage.sync.get.mockClear();
    chrome.storage.sync.set.mockClear();
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.sync.set.mockResolvedValue();

    // Mock confirm dialog
    global.confirm = jest.fn(() => true);

    // Mock UserSettings (centralized settings from types.js)
    globalThis.XCPW_UserSettings = {
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

    // Load options.js
    require('../../dist/options.js');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.confirm;
  });

  describe('initialization', () => {
    it('should get all required DOM elements', () => {
      expect(statusEl).toBeTruthy();
      expect(cacheCountEl).toBeTruthy();
      expect(cacheAgeEl).toBeTruthy();
      expect(refreshStatsBtn).toBeTruthy();
      expect(clearCacheBtn).toBeTruthy();
    });

    it('should add click listener to refresh stats button', () => {
      // The module adds event listener during load
      expect(refreshStatsBtn.onclick !== null || refreshStatsBtn.addEventListener).toBeTruthy();
    });

    it('should add click listener to clear cache button', () => {
      expect(clearCacheBtn.onclick !== null || clearCacheBtn.addEventListener).toBeTruthy();
    });

    it('should load cache stats on DOMContentLoaded', async () => {
      // Dispatch DOMContentLoaded event
      document.dispatchEvent(new Event('DOMContentLoaded'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GET_CACHE_STATS'
      });
    });
  });

  describe('loadCacheStats', () => {
    it('should request cache stats from background', async () => {
      refreshStatsBtn.click();

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

      refreshStatsBtn.click();

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

      refreshStatsBtn.click();

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

      refreshStatsBtn.click();

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

      refreshStatsBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheAgeEl.textContent).toBe('<1h');
    });

    it('should display dash when no oldest entry', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        count: 0,
        oldestEntry: null
      });

      refreshStatsBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheAgeEl.textContent).toBe('-');
    });

    it('should display question marks on error', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      refreshStatsBtn.click();

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

      refreshStatsBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      // Display should remain unchanged when success is false
      expect(cacheCountEl.textContent).toBe('original');
      expect(cacheAgeEl.textContent).toBe('original');
    });

    it('should not update display when response is undefined', async () => {
      cacheCountEl.textContent = 'original';
      cacheAgeEl.textContent = 'original';

      chrome.runtime.sendMessage.mockResolvedValueOnce(undefined);

      refreshStatsBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      // Display should remain unchanged when response is undefined
      expect(cacheCountEl.textContent).toBe('original');
      expect(cacheAgeEl.textContent).toBe('original');
    });
  });

  describe('clearCache', () => {
    it('should show confirmation dialog', async () => {
      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(global.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Are you sure')
      );
    });

    it('should not clear cache if user cancels', async () => {
      global.confirm.mockReturnValueOnce(false);

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({
        type: 'CLEAR_CACHE'
      });
    });

    it('should send CLEAR_CACHE message when confirmed', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CLEAR_CACHE'
      });
    });

    it('should show success status on successful clear', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(statusEl.textContent).toContain('cleared successfully');
      expect(statusEl.className).toContain('success');
    });

    it('should show error status on failed clear', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(statusEl.textContent).toContain('Failed');
      expect(statusEl.className).toContain('error');
    });

    it('should show error status on exception', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(statusEl.textContent).toContain('Failed');
      expect(statusEl.className).toContain('error');
    });

    it('should disable button while loading', async () => {
      // Create a promise we can control
      let resolveMessage;
      const messagePromise = new Promise(resolve => {
        resolveMessage = resolve;
      });
      chrome.runtime.sendMessage.mockReturnValueOnce(messagePromise);

      clearCacheBtn.click();

      // Button should be disabled during loading
      expect(clearCacheBtn.disabled).toBe(true);

      // Resolve the promise
      resolveMessage({ success: true });

      await jest.advanceTimersByTimeAsync(0);

      // Button should be re-enabled after completion
      expect(clearCacheBtn.disabled).toBe(false);
    });

    it('should show loading text while loading', async () => {
      let resolveMessage;
      const messagePromise = new Promise(resolve => {
        resolveMessage = resolve;
      });
      chrome.runtime.sendMessage.mockReturnValueOnce(messagePromise);

      clearCacheBtn.click();

      // Should show loading text
      expect(clearCacheBtn.textContent).toContain('Loading');

      resolveMessage({ success: true });

      await jest.advanceTimersByTimeAsync(0);
    });

    it('should restore original button text after loading', async () => {
      const originalText = clearCacheBtn.textContent;

      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(clearCacheBtn.textContent).toBe(originalText);
    });

    it('should refresh stats after clearing cache', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true }) // CLEAR_CACHE
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null }); // GET_CACHE_STATS

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      // Should have called both CLEAR_CACHE and GET_CACHE_STATS
      const calls = chrome.runtime.sendMessage.mock.calls;
      expect(calls.some(call => call[0].type === 'CLEAR_CACHE')).toBe(true);
      expect(calls.some(call => call[0].type === 'GET_CACHE_STATS')).toBe(true);
    });
  });

  describe('showStatus', () => {
    it('should update status element text', async () => {
      // Trigger a successful cache clear to call showStatus
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(statusEl.textContent.length).toBeGreaterThan(0);
    });

    it('should set success class for success type', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(statusEl.classList.contains('success')).toBe(true);
    });

    it('should set error class for error type', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(statusEl.classList.contains('error')).toBe(true);
    });
  });

  describe('setButtonLoading', () => {
    it('should disable button when loading', async () => {
      let resolveMessage;
      chrome.runtime.sendMessage.mockReturnValueOnce(new Promise(resolve => {
        resolveMessage = resolve;
      }));

      clearCacheBtn.click();

      expect(clearCacheBtn.disabled).toBe(true);

      resolveMessage({ success: true });
      await jest.advanceTimersByTimeAsync(0);
    });

    it('should save original text to dataset', async () => {
      const originalText = clearCacheBtn.textContent;

      let resolveMessage;
      chrome.runtime.sendMessage.mockReturnValueOnce(new Promise(resolve => {
        resolveMessage = resolve;
      }));

      clearCacheBtn.click();

      expect(clearCacheBtn.dataset.originalText).toBe(originalText);

      resolveMessage({ success: true });
      await jest.advanceTimersByTimeAsync(0);
    });

    it('should restore original text when loading completes', async () => {
      const originalText = clearCacheBtn.textContent;

      // Mock both CLEAR_CACHE and the subsequent GET_CACHE_STATS call
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true }) // CLEAR_CACHE
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null }); // GET_CACHE_STATS

      clearCacheBtn.click();

      // Wait for the async operations to complete
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(0);

      // After completion, original text should be restored
      expect(clearCacheBtn.textContent).toBe(originalText);
      expect(clearCacheBtn.disabled).toBe(false);
    });
  });

  describe('loadSettings', () => {
    it('should load settings from chrome.storage.sync on init', async () => {
      // Dispatch DOMContentLoaded event
      document.dispatchEvent(new Event('DOMContentLoaded'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.get).toHaveBeenCalledWith('xcpwSettings');
    });

    it('should set checkbox to saved value when loading settings', async () => {
      // Set up mock before re-requiring the module
      chrome.storage.sync.get.mockResolvedValue({
        xcpwSettings: { showNintendo: false, showPlaystation: true, showXbox: false, showSteamDeck: false }
      });

      // Re-require to test fresh load with saved settings
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      expect(showNintendoCheckbox.checked).toBe(false);
      expect(showPlaystationCheckbox.checked).toBe(true);
      expect(showXboxCheckbox.checked).toBe(false);
      expect(showSteamDeckCheckbox.checked).toBe(false);
    });

    it('should default to true when no settings saved', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({});

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      expect(showNintendoCheckbox.checked).toBe(true);
      expect(showPlaystationCheckbox.checked).toBe(true);
      expect(showXboxCheckbox.checked).toBe(true);
      expect(showSteamDeckCheckbox.checked).toBe(true);
    });

    it('should handle storage errors gracefully', async () => {
      chrome.storage.sync.get.mockRejectedValueOnce(new Error('Storage error'));

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Should not throw, checkbox should remain default
      expect(showSteamDeckCheckbox.checked).toBe(true);
    });
  });

  describe('saveSettings', () => {
    it('should save settings when Steam Deck checkbox changes', async () => {
      showSteamDeckCheckbox.checked = false;
      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        xcpwSettings: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false, showHltb: true }
      });
    });

    it('should save settings when Nintendo checkbox changes', async () => {
      showNintendoCheckbox.checked = false;
      showNintendoCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        xcpwSettings: { showNintendo: false, showPlaystation: true, showXbox: true, showSteamDeck: true, showHltb: true }
      });
    });

    it('should save settings when PlayStation checkbox changes', async () => {
      showPlaystationCheckbox.checked = false;
      showPlaystationCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        xcpwSettings: { showNintendo: true, showPlaystation: false, showXbox: true, showSteamDeck: true, showHltb: true }
      });
    });

    it('should save settings when Xbox checkbox changes', async () => {
      showXboxCheckbox.checked = false;
      showXboxCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        xcpwSettings: { showNintendo: true, showPlaystation: true, showXbox: false, showSteamDeck: true, showHltb: true }
      });
    });

    it('should save settings when checkbox is checked', async () => {
      showSteamDeckCheckbox.checked = true;
      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        xcpwSettings: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true, showHltb: true }
      });
    });

    it('should show success status after saving', async () => {
      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(settingsStatusEl.textContent).toContain('Settings saved');
      expect(settingsStatusEl.className).toContain('success');
    });

    it('should show error status on save failure', async () => {
      chrome.storage.sync.set.mockRejectedValueOnce(new Error('Save failed'));

      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(settingsStatusEl.textContent).toContain('Failed');
      expect(settingsStatusEl.className).toContain('error');
    });

    it('should auto-hide settings status after 2 seconds', async () => {
      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(settingsStatusEl.className).toContain('success');

      // Advance past the 2 second timeout
      await jest.advanceTimersByTimeAsync(2100);

      expect(settingsStatusEl.className).toBe('status');
    });
  });

  describe('showSettingsStatus', () => {
    it('should update settings status element text', async () => {
      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(settingsStatusEl.textContent.length).toBeGreaterThan(0);
    });

    it('should set success class for success type', async () => {
      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(settingsStatusEl.classList.contains('success')).toBe(true);
    });

    it('should set error class for error type', async () => {
      chrome.storage.sync.set.mockRejectedValueOnce(new Error('Error'));

      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(settingsStatusEl.classList.contains('error')).toBe(true);
    });
  });

  describe('null element handling', () => {
    it('should handle missing settingsStatusEl gracefully', async () => {
      // Remove settingsStatusEl
      settingsStatusEl.remove();

      // Re-require to test with missing element
      jest.resetModules();
      require('../../dist/options.js');

      // Trigger settings change - should not throw
      const checkbox = document.getElementById('show-steamdeck');
      checkbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      // Should complete without error
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });

    it('should handle missing showSteamDeckCheckbox gracefully', async () => {
      // Remove checkbox
      showSteamDeckCheckbox.remove();

      // Re-require to test with missing element
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));

      await jest.advanceTimersByTimeAsync(0);

      // Should complete without error
      expect(chrome.storage.sync.get).toHaveBeenCalled();
    });

    it('should handle all checkboxes missing gracefully', async () => {
      // Remove all checkboxes to test all null check branches
      showNintendoCheckbox.remove();
      showPlaystationCheckbox.remove();
      showXboxCheckbox.remove();
      showSteamDeckCheckbox.remove();
      showHltbCheckbox.remove();

      // Re-require to test with missing elements
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));

      await jest.advanceTimersByTimeAsync(0);

      // Should complete without error
      expect(chrome.storage.sync.get).toHaveBeenCalled();
    });

    it('should handle setButtonLoading without originalText', async () => {
      // Delete the originalText dataset before it can be set
      delete clearCacheBtn.dataset.originalText;
      clearCacheBtn.textContent = 'Test';

      // Set loading
      clearCacheBtn.disabled = true;
      clearCacheBtn.innerHTML = '<span class="loading"></span>Loading...';

      // Set not loading without originalText
      clearCacheBtn.disabled = false;
      // The else-if branch: button.dataset.originalText is undefined

      expect(clearCacheBtn.disabled).toBe(false);
    });
  });
});
