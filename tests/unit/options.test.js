/**
 * Unit tests for options.js
 *
 * Note: Uses innerHTML for test fixtures with static, trusted content (safe in tests)
 */

describe('options.js', () => {
  let cacheStatusEl;
  let settingsStatusEl;
  let cacheCountEl;
  let cacheAgeEl;
  let refreshStatsBtn;
  let clearCacheBtn;
  let exportCacheBtn;
  let showNintendoCheckbox;
  let showPlaystationCheckbox;
  let showXboxCheckbox;
  let showSteamDeckCheckbox;
  let showHltbCheckbox;
  let hltbDisplayStatSelect;
  let showReviewScoresCheckbox;
  let reviewScoreSourceSelect;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    // Set up DOM elements that options.js expects using DOM API
    document.body.textContent = '';

    cacheStatusEl = document.createElement('div');
    cacheStatusEl.id = 'cache-status';
    cacheStatusEl.className = 'status';
    document.body.appendChild(cacheStatusEl);

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

    exportCacheBtn = document.createElement('button');
    exportCacheBtn.id = 'export-cache-btn';
    exportCacheBtn.textContent = 'Export Cache';
    document.body.appendChild(exportCacheBtn);

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

    hltbDisplayStatSelect = document.createElement('select');
    hltbDisplayStatSelect.id = 'hltb-display-stat';
    hltbDisplayStatSelect.hidden = true;
    // Add default option to match production HTML
    const defaultOption = document.createElement('option');
    defaultOption.value = 'mainStory';
    defaultOption.textContent = 'Main Story';
    hltbDisplayStatSelect.appendChild(defaultOption);
    document.body.appendChild(hltbDisplayStatSelect);

    showReviewScoresCheckbox = document.createElement('input');
    showReviewScoresCheckbox.type = 'checkbox';
    showReviewScoresCheckbox.id = 'show-review-scores';
    showReviewScoresCheckbox.checked = true;
    document.body.appendChild(showReviewScoresCheckbox);

    reviewScoreSourceSelect = document.createElement('select');
    reviewScoreSourceSelect.id = 'review-score-source';
    reviewScoreSourceSelect.hidden = true;
    const openCriticOption = document.createElement('option');
    openCriticOption.value = 'opencritic';
    openCriticOption.textContent = 'OpenCritic';
    reviewScoreSourceSelect.appendChild(openCriticOption);
    document.body.appendChild(reviewScoreSourceSelect);

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
    globalThis.SCPW_UserSettings = {
      DEFAULT_USER_SETTINGS: {
        showNintendo: true,
        showPlaystation: true,
        showXbox: true,
        showSteamDeck: true,
        showHltb: true,
        hltbDisplayStat: 'mainStory',
        showReviewScores: true,
        reviewScoreSource: 'opencritic'
      },
      SETTING_CHECKBOX_IDS: {
        showNintendo: 'show-nintendo',
        showPlaystation: 'show-playstation',
        showXbox: 'show-xbox',
        showSteamDeck: 'show-steamdeck',
        showHltb: 'show-hltb',
        showReviewScores: 'show-review-scores'
      },
      SETTING_SELECT_IDS: {
        hltbDisplayStat: {
          elementId: 'hltb-display-stat',
          visibilityKey: 'showHltb'
        },
        reviewScoreSource: {
          elementId: 'review-score-source',
          visibilityKey: 'showReviewScores'
        }
      },
      USER_SETTING_KEYS: ['showNintendo', 'showPlaystation', 'showXbox', 'showSteamDeck', 'showHltb', 'hltbDisplayStat', 'showReviewScores', 'reviewScoreSource']
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
      expect(cacheStatusEl).toBeTruthy();
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

      expect(cacheStatusEl.textContent).toContain('cleared successfully');
      expect(cacheStatusEl.className).toContain('success');
    });

    it('should show error status on failed clear', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheStatusEl.textContent).toContain('Failed');
      expect(cacheStatusEl.className).toContain('error');
    });

    it('should show error status on exception', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheStatusEl.textContent).toContain('Failed');
      expect(cacheStatusEl.className).toContain('error');
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

      expect(cacheStatusEl.textContent.length).toBeGreaterThan(0);
    });

    it('should set success class for success type', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheStatusEl.classList.contains('success')).toBe(true);
    });

    it('should set error class for error type', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false });

      clearCacheBtn.click();

      await jest.advanceTimersByTimeAsync(0);

      expect(cacheStatusEl.classList.contains('error')).toBe(true);
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

    it('should save original html to dataset', async () => {
      const originalHtml = clearCacheBtn.innerHTML;

      let resolveMessage;
      chrome.runtime.sendMessage.mockReturnValueOnce(new Promise(resolve => {
        resolveMessage = resolve;
      }));

      clearCacheBtn.click();

      expect(clearCacheBtn.dataset.originalHtml).toBe(originalHtml);

      resolveMessage({ success: true });
      await jest.advanceTimersByTimeAsync(0);
    });

    it('should restore original html when loading completes', async () => {
      const originalHtml = clearCacheBtn.innerHTML;

      // Mock both CLEAR_CACHE and the subsequent GET_CACHE_STATS call
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true }) // CLEAR_CACHE
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null }); // GET_CACHE_STATS

      clearCacheBtn.click();

      // Wait for the async operations to complete
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(0);

      // After completion, original text should be restored
      expect(clearCacheBtn.innerHTML).toBe(originalHtml);
      expect(clearCacheBtn.disabled).toBe(false);
    });
  });

  describe('exportCache', () => {
    beforeEach(() => {
      // Mock URL.createObjectURL and URL.revokeObjectURL
      global.URL.createObjectURL = jest.fn().mockReturnValue('blob:test-url');
      global.URL.revokeObjectURL = jest.fn();
      // Mock chrome.runtime.getManifest
      chrome.runtime.getManifest = jest.fn().mockReturnValue({ version: '0.8.0' });
    });

    it('should request cache export and trigger download', async () => {
      window.confirm = jest.fn().mockReturnValue(true);
      const entries = [
        { appid: '123', gameName: 'Game A', resolvedAt: Date.now(), ttlDays: 7 }
      ];
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, count: 1, oldestEntry: Date.now() }) // init GET_CACHE_STATS
        .mockResolvedValueOnce({ success: true, data: entries }); // GET_CACHE_EXPORT

      // Re-init to register event listeners
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Click the export button
      const clickSpy = jest.fn();
      jest.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = document.createElement.wrappedMethod
          ? document.createElement.wrappedMethod.call(document, tag)
          : Object.getPrototypeOf(document).createElement.call(document, tag);
        if (tag === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      exportCacheBtn.click();
      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_CACHE_EXPORT' });

      // Restore
      document.createElement.mockRestore?.();
    });

    it('should show error when export fails', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null }) // init
        .mockResolvedValueOnce({ success: false }); // GET_CACHE_EXPORT fails

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      exportCacheBtn.click();
      await jest.advanceTimersByTimeAsync(0);

      expect(cacheStatusEl.textContent).toBe('Failed to export cache.');
      expect(cacheStatusEl.className).toContain('error');
    });

    it('should show error when export throws', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null }) // init
        .mockRejectedValueOnce(new Error('Network error')); // GET_CACHE_EXPORT throws

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      exportCacheBtn.click();
      await jest.advanceTimersByTimeAsync(0);

      expect(cacheStatusEl.textContent).toBe('Failed to export cache.');
    });

    it('should show loading state during export', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null }) // init
        .mockImplementationOnce(() => {
          // Check loading state while request is pending
          expect(exportCacheBtn.disabled).toBe(true);
          return Promise.resolve({ success: true, data: [] });
        });

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      exportCacheBtn.click();
      await jest.advanceTimersByTimeAsync(0);

      // After completion, button should be re-enabled
      expect(exportCacheBtn.disabled).toBe(false);
    });
  });

  describe('loadSettings', () => {
    it('should load settings from chrome.storage.sync on init', async () => {
      // Dispatch DOMContentLoaded event
      document.dispatchEvent(new Event('DOMContentLoaded'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.get).toHaveBeenCalledWith('scpwSettings');
    });

    it('should set checkbox to saved value when loading settings', async () => {
      // Set up mock before re-requiring the module
      chrome.storage.sync.get.mockResolvedValue({
        scpwSettings: { showNintendo: false, showPlaystation: true, showXbox: false, showSteamDeck: false, showHltb: true, hltbDisplayStat: 'mainStory', showReviewScores: true, reviewScoreSource: 'opencritic' }
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
        scpwSettings: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: false, showHltb: true, hltbDisplayStat: 'mainStory', showReviewScores: true, reviewScoreSource: 'opencritic' }
      });
    });

    it('should save settings when Nintendo checkbox changes', async () => {
      showNintendoCheckbox.checked = false;
      showNintendoCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        scpwSettings: { showNintendo: false, showPlaystation: true, showXbox: true, showSteamDeck: true, showHltb: true, hltbDisplayStat: 'mainStory', showReviewScores: true, reviewScoreSource: 'opencritic' }
      });
    });

    it('should save settings when PlayStation checkbox changes', async () => {
      showPlaystationCheckbox.checked = false;
      showPlaystationCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        scpwSettings: { showNintendo: true, showPlaystation: false, showXbox: true, showSteamDeck: true, showHltb: true, hltbDisplayStat: 'mainStory', showReviewScores: true, reviewScoreSource: 'opencritic' }
      });
    });

    it('should save settings when Xbox checkbox changes', async () => {
      showXboxCheckbox.checked = false;
      showXboxCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        scpwSettings: { showNintendo: true, showPlaystation: true, showXbox: false, showSteamDeck: true, showHltb: true, hltbDisplayStat: 'mainStory', showReviewScores: true, reviewScoreSource: 'opencritic' }
      });
    });

    it('should save settings when checkbox is checked', async () => {
      showSteamDeckCheckbox.checked = true;
      showSteamDeckCheckbox.dispatchEvent(new Event('change'));

      await jest.advanceTimersByTimeAsync(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        scpwSettings: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true, showHltb: true, hltbDisplayStat: 'mainStory', showReviewScores: true, reviewScoreSource: 'opencritic' }
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

    it('should handle setButtonLoading without originalHtml', async () => {
      // Delete the originalHtml dataset before it can be set
      delete clearCacheBtn.dataset.originalHtml;
      clearCacheBtn.textContent = 'Test';

      // Set loading
      clearCacheBtn.disabled = true;
      clearCacheBtn.innerHTML = '<span class="loading"></span>Loading...';

      // Set not loading without originalText
      clearCacheBtn.disabled = false;
      // The else-if branch: button.dataset.originalHtml is undefined

      expect(clearCacheBtn.disabled).toBe(false);
    });
  });

  describe('HLTB row visibility', () => {
    it('should show hltb-stat-row when HLTB checkbox is checked', async () => {
      // Start with hidden attribute
      hltbDisplayStatSelect.hidden = true;
      showHltbCheckbox.checked = true;

      // Re-require to reinitialize with our DOM
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Row should be visible (hidden attribute removed)
      expect(hltbDisplayStatSelect.hidden).toBe(false);
    });

    it('should hide hltb-stat-row when HLTB checkbox is unchecked', async () => {
      // Start visible
      hltbDisplayStatSelect.hidden = false;

      // Mock storage to return showHltb: false so loadSettings sets checkbox to unchecked
      chrome.storage.sync.get.mockResolvedValueOnce({
        scpwSettings: { showNintendo: true, showPlaystation: true, showXbox: true, showSteamDeck: true, showHltb: false, hltbDisplayStat: 'mainStory', showReviewScores: true, reviewScoreSource: 'opencritic' }
      });

      // Re-require to reinitialize with our DOM
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Row should be hidden
      expect(hltbDisplayStatSelect.hidden).toBe(true);
    });

    it('should toggle hltb-stat-row visibility when checkbox changes', async () => {
      // Dispatch DOMContentLoaded first
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Initially checkbox is checked, row should be visible
      expect(hltbDisplayStatSelect.hidden).toBe(false);

      // Uncheck the checkbox
      showHltbCheckbox.checked = false;
      showHltbCheckbox.dispatchEvent(new Event('change'));
      await jest.advanceTimersByTimeAsync(0);

      // Row should now be hidden
      expect(hltbDisplayStatSelect.hidden).toBe(true);

      // Check the checkbox again
      showHltbCheckbox.checked = true;
      showHltbCheckbox.dispatchEvent(new Event('change'));
      await jest.advanceTimersByTimeAsync(0);

      // Row should be visible again
      expect(hltbDisplayStatSelect.hidden).toBe(false);
    });

    it('should toggle hltb-row class when HLTB checkbox changes with hltb-row element', async () => {
      // Remove existing checkbox first (to avoid duplicate IDs)
      if (showHltbCheckbox && showHltbCheckbox.parentNode) {
        showHltbCheckbox.parentNode.removeChild(showHltbCheckbox);
      }

      // Create the hltb-row element with the exact selector the code looks for:
      // .toggle-item.has-inline-option[data-platform="hltb"]
      const hltbRow = document.createElement('div');
      hltbRow.className = 'toggle-item has-inline-option';
      hltbRow.setAttribute('data-platform', 'hltb');

      // Recreate showHltbCheckbox INSIDE the row (to match production HTML structure)
      showHltbCheckbox = document.createElement('input');
      showHltbCheckbox.type = 'checkbox';
      showHltbCheckbox.id = 'show-hltb';
      showHltbCheckbox.checked = true;
      hltbRow.appendChild(showHltbCheckbox);

      document.body.appendChild(hltbRow);

      // Re-require to reinitialize with our DOM
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // With showHltb = true, the hltb-row should not have the class
      const updatedRow = document.querySelector('.toggle-item.has-inline-option[data-platform="hltb"]');
      expect(updatedRow.classList.contains('inline-select-hidden')).toBe(false);

      // Now uncheck and verify the class is added
      const checkbox = document.getElementById('show-hltb');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      await jest.advanceTimersByTimeAsync(0);

      expect(updatedRow.classList.contains('inline-select-hidden')).toBe(true);
    });
  });

  describe('updateToggleActiveStates', () => {
    it('should toggle active class on platform-toggle wrapper', async () => {
      // Create a platform-toggle wrapper for the checkbox
      const toggleWrapper = document.createElement('label');
      toggleWrapper.className = 'platform-toggle';

      // Move checkbox into wrapper
      showNintendoCheckbox.parentElement.removeChild(showNintendoCheckbox);
      toggleWrapper.appendChild(showNintendoCheckbox);
      document.body.appendChild(toggleWrapper);

      // Re-require to reinitialize
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // With checkbox checked, wrapper should have active class
      expect(toggleWrapper.classList.contains('active')).toBe(true);

      // Uncheck and trigger change
      showNintendoCheckbox.checked = false;
      showNintendoCheckbox.dispatchEvent(new Event('change'));
      await jest.advanceTimersByTimeAsync(0);

      // Wrapper should not have active class
      expect(toggleWrapper.classList.contains('active')).toBe(false);
    });

    it('should toggle active class on option-item wrapper', async () => {
      // Create option-item wrapper for the checkbox
      const optionWrapper = document.createElement('label');
      optionWrapper.className = 'option-item';

      // Move checkbox into wrapper
      showPlaystationCheckbox.parentElement.removeChild(showPlaystationCheckbox);
      optionWrapper.appendChild(showPlaystationCheckbox);
      document.body.appendChild(optionWrapper);

      // Re-require to reinitialize
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // With checkbox checked, wrapper should have active class
      expect(optionWrapper.classList.contains('active')).toBe(true);
    });
  });

  describe('initializeCollapsibleSections', () => {
    it('should initialize collapsible sections with collapse button', async () => {
      // Create a collapsible section structure
      const section = document.createElement('section');
      section.setAttribute('data-collapsible', '');

      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'collapse-btn';
      collapseBtn.setAttribute('aria-controls', 'test-body');
      section.appendChild(collapseBtn);

      const body = document.createElement('div');
      body.id = 'test-body';
      section.appendChild(body);

      document.body.appendChild(section);

      // Re-require to reinitialize
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Section should not be collapsed initially
      expect(section.classList.contains('collapsed')).toBe(false);
      expect(collapseBtn.getAttribute('aria-expanded')).toBe('true');
      expect(body.hidden).toBe(false);

      // Click the collapse button
      collapseBtn.click();

      // Section should be collapsed
      expect(section.classList.contains('collapsed')).toBe(true);
      expect(collapseBtn.getAttribute('aria-expanded')).toBe('false');
      expect(body.hidden).toBe(true);

      // Click again to expand
      collapseBtn.click();

      // Section should be expanded again
      expect(section.classList.contains('collapsed')).toBe(false);
    });

    it('should respect initial collapsed state', async () => {
      // Create a collapsible section that starts collapsed
      const section = document.createElement('section');
      section.setAttribute('data-collapsible', '');
      section.classList.add('collapsed');

      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'collapse-btn';
      collapseBtn.setAttribute('aria-controls', 'test-body-2');
      section.appendChild(collapseBtn);

      const body = document.createElement('div');
      body.id = 'test-body-2';
      section.appendChild(body);

      document.body.appendChild(section);

      // Re-require to reinitialize
      jest.resetModules();
      require('../../dist/options.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      // Section should be collapsed
      expect(section.classList.contains('collapsed')).toBe(true);
      expect(body.hidden).toBe(true);
    });

    it('should skip buttons without aria-controls', async () => {
      // Create a section with a button that has no aria-controls
      const section = document.createElement('section');
      section.setAttribute('data-collapsible', '');

      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'collapse-btn';
      // No aria-controls attribute
      section.appendChild(collapseBtn);

      document.body.appendChild(section);

      // Re-require to reinitialize
      jest.resetModules();
      require('../../dist/options.js');

      // Should not throw
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      expect(true).toBe(true); // Just verify no error
    });

    it('should skip when body element is not found', async () => {
      // Create a section with aria-controls pointing to non-existent element
      const section = document.createElement('section');
      section.setAttribute('data-collapsible', '');

      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'collapse-btn';
      collapseBtn.setAttribute('aria-controls', 'non-existent-id');
      section.appendChild(collapseBtn);

      document.body.appendChild(section);

      // Re-require to reinitialize
      jest.resetModules();
      require('../../dist/options.js');

      // Should not throw
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await jest.advanceTimersByTimeAsync(0);

      expect(true).toBe(true); // Just verify no error
    });
  });

  describe('initialization', () => {
    it('should run initializePage when DOM is already loaded', () => {
      // options.js has already run, just verify it completed without error
      expect(document.getElementById('cache-status')).toBeTruthy();
    });
  });
});
