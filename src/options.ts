/**
 * Steam Cross-Platform Wishlist - Options Page
 *
 * Handles the options UI for managing the cache.
 */

// Constants
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const LOG_PREFIX = '[XCPW Options]';

// DOM Elements
const statusEl = document.getElementById('status') as HTMLElement;
const settingsStatusEl = document.getElementById('settings-status') as HTMLElement | null;
const cacheCountEl = document.getElementById('cache-count') as HTMLElement;
const cacheAgeEl = document.getElementById('cache-age') as HTMLElement;
const refreshStatsBtn = document.getElementById('refresh-stats-btn') as HTMLButtonElement;
const clearCacheBtn = document.getElementById('clear-cache-btn') as HTMLButtonElement;
const showSteamDeckCheckbox = document.getElementById('show-steamdeck') as HTMLInputElement | null;

// Default settings
interface Settings {
  showSteamDeck: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  showSteamDeck: true
};

/**
 * Formats a duration in milliseconds to a human-readable string
 */
function formatAge(ms: number): string {
  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return '<1h';
}

/**
 * Shows a status message
 */
function showStatus(message: string, type: 'success' | 'error'): void {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

/**
 * Shows a status message for settings
 */
function showSettingsStatus(message: string, type: 'success' | 'error'): void {
  if (settingsStatusEl) {
    settingsStatusEl.textContent = message;
    settingsStatusEl.className = `status ${type}`;
    // Auto-hide after 2 seconds
    setTimeout(() => {
      settingsStatusEl.className = 'status';
    }, 2000);
  }
}

/**
 * Loads settings from chrome.storage.sync
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get('xcpwSettings');
    const settings: Settings = { ...DEFAULT_SETTINGS, ...result.xcpwSettings };

    if (showSteamDeckCheckbox) {
      showSteamDeckCheckbox.checked = settings.showSteamDeck;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading settings:`, error);
  }
}

/**
 * Saves settings to chrome.storage.sync
 */
async function saveSettings(settings: Settings): Promise<void> {
  try {
    await chrome.storage.sync.set({ xcpwSettings: settings });
    showSettingsStatus('Settings saved', 'success');
  } catch (error) {
    console.error(`${LOG_PREFIX} Error saving settings:`, error);
    showSettingsStatus('Failed to save settings', 'error');
  }
}

/**
 * Handles Steam Deck toggle change
 */
async function handleSteamDeckToggle(): Promise<void> {
  const settings: Settings = {
    showSteamDeck: showSteamDeckCheckbox!.checked
  };
  await saveSettings(settings);
}

/**
 * Sets loading state on a button
 */
function setButtonLoading(button: HTMLButtonElement, loading: boolean): void {
  button.disabled = loading;
  if (loading) {
    button.dataset.originalText = button.textContent || '';
    button.innerHTML = '<span class="loading"></span>Loading...';
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
}

interface CacheStatsResponse {
  success: boolean;
  count?: number;
  oldestEntry?: number | null;
}

/**
 * Loads and displays cache statistics
 */
async function loadCacheStats(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CACHE_STATS' }) as CacheStatsResponse;

    if (response?.success && response.count !== undefined) {
      cacheCountEl.textContent = response.count.toString();
      cacheAgeEl.textContent = response.oldestEntry
        ? formatAge(Date.now() - response.oldestEntry)
        : '-';
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading cache stats:`, error);
    cacheCountEl.textContent = '?';
    cacheAgeEl.textContent = '?';
  }
}

interface ClearCacheResponse {
  success: boolean;
}

/**
 * Clears the cache after user confirmation
 */
async function clearCache(): Promise<void> {
  const confirmed = confirm('Are you sure you want to clear the cache? All games will need to be re-resolved.');
  if (!confirmed) {
    return;
  }

  setButtonLoading(clearCacheBtn, true);

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }) as ClearCacheResponse;

    if (response?.success) {
      showStatus('Cache cleared successfully.', 'success');
      await loadCacheStats();
    } else {
      showStatus('Failed to clear cache.', 'error');
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error clearing cache:`, error);
    showStatus('Failed to clear cache.', 'error');
  } finally {
    setButtonLoading(clearCacheBtn, false);
  }
}

// Event Listeners
refreshStatsBtn.addEventListener('click', loadCacheStats);
clearCacheBtn.addEventListener('click', clearCache);
if (showSteamDeckCheckbox) {
  showSteamDeckCheckbox.addEventListener('change', handleSteamDeckToggle);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCacheStats();
  loadSettings();
});
