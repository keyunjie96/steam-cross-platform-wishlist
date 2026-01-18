/**
 * Steam Cross-Platform Wishlist - Popup UI
 *
 * Provides quick access to cache statistics, platform toggles, and a clear cache button.
 */

import type { UserSettings } from './types';

// Constants
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const LOG_PREFIX = '[XCPW Popup]';

// Get centralized settings definitions from types.ts
const { DEFAULT_USER_SETTINGS, SETTING_CHECKBOX_IDS, USER_SETTING_KEYS } = globalThis.XCPW_UserSettings;

// DOM Elements
const statusEl = document.getElementById('status') as HTMLElement;
const cacheCountEl = document.getElementById('cache-count') as HTMLElement;
const cacheAgeEl = document.getElementById('cache-age') as HTMLElement;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const optionsLink = document.getElementById('options-link') as HTMLAnchorElement;

// Dynamic checkbox map - populated from SETTING_CHECKBOX_IDS
const checkboxes = new Map<keyof UserSettings, HTMLInputElement | null>();

// Populate checkbox map on load
for (const key of USER_SETTING_KEYS) {
  const checkboxId = SETTING_CHECKBOX_IDS[key];
  checkboxes.set(key, document.getElementById(checkboxId) as HTMLInputElement | null);
}

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
    const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, ...result.xcpwSettings };

    // Dynamically update all checkboxes from the centralized settings definition
    for (const key of USER_SETTING_KEYS) {
      const checkbox = checkboxes.get(key);
      if (checkbox) {
        checkbox.checked = settings[key];
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading settings:`, error);
  }
}

/**
 * Gets current settings from checkboxes.
 * Dynamically reads from the centralized settings definition.
 */
function getCurrentSettings(): UserSettings {
  const settings = { ...DEFAULT_USER_SETTINGS };
  for (const key of USER_SETTING_KEYS) {
    const checkbox = checkboxes.get(key);
    settings[key] = checkbox?.checked ?? DEFAULT_USER_SETTINGS[key];
  }
  return settings;
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
  // Set up event listeners for buttons and links
  refreshBtn.addEventListener('click', loadCacheStats);
  clearBtn.addEventListener('click', clearCache);
  optionsLink.addEventListener('click', openOptionsPage);

  // Dynamically add event listeners to all setting checkboxes
  // This automatically includes any new settings added to SETTING_CHECKBOX_IDS
  for (const key of USER_SETTING_KEYS) {
    const checkbox = checkboxes.get(key);
    if (checkbox) {
      checkbox.addEventListener('change', saveSettings);
    }
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
