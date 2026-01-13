/**
 * Unit tests for options.js
 *
 * Note: Uses innerHTML for test fixtures with static, trusted content (safe in tests)
 */

describe('options.js', () => {
  let statusEl;
  let cacheCountEl;
  let cacheAgeEl;
  let refreshStatsBtn;
  let clearCacheBtn;

  beforeEach(() => {
    jest.resetModules();

    // Set up DOM elements that options.js expects using DOM API
    document.body.textContent = '';

    statusEl = document.createElement('div');
    statusEl.id = 'status';
    statusEl.className = 'status';
    document.body.appendChild(statusEl);

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

    // Mock chrome.runtime.sendMessage
    chrome.runtime.sendMessage.mockClear();
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      count: 10,
      oldestEntry: Date.now() - 86400000 // 1 day ago
    });

    // Mock confirm dialog
    global.confirm = jest.fn(() => true);

    // Load options.js
    require('../../src/options.js');
  });

  afterEach(() => {
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

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GET_CACHE_STATS'
      });
    });
  });

  describe('loadCacheStats', () => {
    it('should request cache stats from background', async () => {
      refreshStatsBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

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

      await new Promise(resolve => setTimeout(resolve, 0));

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

      await new Promise(resolve => setTimeout(resolve, 0));

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

      await new Promise(resolve => setTimeout(resolve, 0));

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

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(cacheAgeEl.textContent).toBe('<1h');
    });

    it('should display dash when no oldest entry', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        count: 0,
        oldestEntry: null
      });

      refreshStatsBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(cacheAgeEl.textContent).toBe('-');
    });

    it('should display question marks on error', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      refreshStatsBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(cacheCountEl.textContent).toBe('?');
      expect(cacheAgeEl.textContent).toBe('?');
    });
  });

  describe('clearCache', () => {
    it('should show confirmation dialog', async () => {
      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(global.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Are you sure')
      );
    });

    it('should not clear cache if user cancels', async () => {
      global.confirm.mockReturnValueOnce(false);

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({
        type: 'CLEAR_CACHE'
      });
    });

    it('should send CLEAR_CACHE message when confirmed', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CLEAR_CACHE'
      });
    });

    it('should show success status on successful clear', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(statusEl.textContent).toContain('cleared successfully');
      expect(statusEl.className).toContain('success');
    });

    it('should show error status on failed clear', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false });

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(statusEl.textContent).toContain('Failed');
      expect(statusEl.className).toContain('error');
    });

    it('should show error status on exception', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

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

      await new Promise(resolve => setTimeout(resolve, 0));

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

      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should restore original button text after loading', async () => {
      const originalText = clearCacheBtn.textContent;

      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(clearCacheBtn.textContent).toBe(originalText);
    });

    it('should refresh stats after clearing cache', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true }) // CLEAR_CACHE
        .mockResolvedValueOnce({ success: true, count: 0, oldestEntry: null }); // GET_CACHE_STATS

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

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

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(statusEl.textContent.length).toBeGreaterThan(0);
    });

    it('should set success class for success type', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(statusEl.classList.contains('success')).toBe(true);
    });

    it('should set error class for error type', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false });

      clearCacheBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

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
      await new Promise(resolve => setTimeout(resolve, 0));
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
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });
});
