/**
 * Steam Cross-Platform Wishlist - Popup UI
 *
 * Provides quick access to cache statistics, platform toggles, and a clear cache button.
 */

// Constants
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const LOG_PREFIX = '[XCPW Popup]';

// DOM Elements
const statusEl = document.getElementById('status') as HTMLElement;
const cacheCountEl = document.getElementById('cache-count') as HTMLElement;
const cacheAgeEl = document.getElementById('cache-age') as HTMLElement;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const optionsLink = document.getElementById('options-link') as HTMLAnchorElement;

// Platform toggle elements
const showNintendoCheckbox = document.getElementById('show-nintendo') as HTMLInputElement | null;
const showPlaystationCheckbox = document.getElementById('show-playstation') as HTMLInputElement | null;
const showXboxCheckbox = document.getElementById('show-xbox') as HTMLInputElement | null;
const showSteamDeckCheckbox = document.getElementById('show-steamdeck') as HTMLInputElement | null;

// Default settings
interface Settings {
  showNintendo: boolean;
  showPlaystation: boolean;
  showXbox: boolean;
  showSteamDeck: boolean;
  showReviewScores: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  showNintendo: true,
  showPlaystation: true,
  showXbox: true,
  showSteamDeck: true,
  showReviewScores: true
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
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusEl.className = 'status';
  }, 3000);
}

/**
 * Sets loading state on a button
 */
function setButtonLoading(button: HTMLButtonElement, loading: boolean): void {
  button.disabled = loading;
  if (loading) {
    button.dataset.originalText = button.textContent || '';
    button.innerHTML = '<span class="loading"></span>';
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
  setButtonLoading(refreshBtn, true);

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
  } finally {
    setButtonLoading(refreshBtn, false);
  }
}

interface ClearCacheResponse {
  success: boolean;
}

/**
 * Clears the cache after user confirmation
 */
async function clearCache(): Promise<void> {
  const confirmed = confirm('Clear all cached platform data?');
  if (!confirmed) {
    return;
  }

  setButtonLoading(clearBtn, true);

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }) as ClearCacheResponse;

    if (response?.success) {
      showStatus('Cache cleared', 'success');
      await loadCacheStats();
    } else {
      showStatus('Failed to clear cache', 'error');
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error clearing cache:`, error);
    showStatus('Failed to clear cache', 'error');
  } finally {
    setButtonLoading(clearBtn, false);
  }
}

/**
 * Opens the options page
 */
function openOptionsPage(event: Event): void {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
}

/**
 * Loads settings from chrome.storage.sync
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get('xcpwSettings');
    const settings: Settings = { ...DEFAULT_SETTINGS, ...result.xcpwSettings };

    if (showNintendoCheckbox) {
      showNintendoCheckbox.checked = settings.showNintendo;
    }
    if (showPlaystationCheckbox) {
      showPlaystationCheckbox.checked = settings.showPlaystation;
    }
    if (showXboxCheckbox) {
      showXboxCheckbox.checked = settings.showXbox;
    }
    if (showSteamDeckCheckbox) {
      showSteamDeckCheckbox.checked = settings.showSteamDeck;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading settings:`, error);
  }
}

/**
 * Gets current settings from checkboxes
 */
function getCurrentSettings(): Settings {
  return {
    showNintendo: showNintendoCheckbox?.checked ?? DEFAULT_SETTINGS.showNintendo,
    showPlaystation: showPlaystationCheckbox?.checked ?? DEFAULT_SETTINGS.showPlaystation,
    showXbox: showXboxCheckbox?.checked ?? DEFAULT_SETTINGS.showXbox,
    showSteamDeck: showSteamDeckCheckbox?.checked ?? DEFAULT_SETTINGS.showSteamDeck,
    showReviewScores: DEFAULT_SETTINGS.showReviewScores // Not configurable in popup, use options page
  };
}

/**
 * Saves settings to chrome.storage.sync
 */
async function saveSettings(): Promise<void> {
  try {
    const settings = getCurrentSettings();
    await chrome.storage.sync.set({ xcpwSettings: settings });
    showStatus('Settings saved', 'success');
  } catch (error) {
    console.error(`${LOG_PREFIX} Error saving settings:`, error);
    showStatus('Failed to save', 'error');
  }
}

/**
 * Initialize the popup
 */
async function initializePopup(): Promise<void> {
  // Set up event listeners
  refreshBtn.addEventListener('click', loadCacheStats);
  clearBtn.addEventListener('click', clearCache);
  optionsLink.addEventListener('click', openOptionsPage);

  // Platform toggle listeners
  if (showNintendoCheckbox) {
    showNintendoCheckbox.addEventListener('change', saveSettings);
  }
  if (showPlaystationCheckbox) {
    showPlaystationCheckbox.addEventListener('change', saveSettings);
  }
  if (showXboxCheckbox) {
    showXboxCheckbox.addEventListener('change', saveSettings);
  }
  if (showSteamDeckCheckbox) {
    showSteamDeckCheckbox.addEventListener('change', saveSettings);
  }

  // Load data, then reveal UI
  await Promise.all([loadCacheStats(), loadSettings()]);
  document.body.classList.remove('is-loading');
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup();
}
