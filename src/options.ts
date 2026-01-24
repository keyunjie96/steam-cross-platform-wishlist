/**
 * Steam Cross-Platform Wishlist - Options Page
 *
 * Handles the options UI for managing the cache.
 */

import type { UserSettings, HltbDisplayStat } from './types';

// Constants
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const LOG_PREFIX = '[XCPW Options]';

// Get centralized settings definitions from types.ts
const { DEFAULT_USER_SETTINGS, SETTING_CHECKBOX_IDS, USER_SETTING_KEYS } = globalThis.XCPW_UserSettings;

// DOM Elements (initialized in DOMContentLoaded)
let statusEl: HTMLElement;
let settingsStatusEl: HTMLElement | null;
let cacheCountEl: HTMLElement;
let cacheAgeEl: HTMLElement;
let refreshStatsBtn: HTMLButtonElement;
let clearCacheBtn: HTMLButtonElement;

// Dynamic checkbox map - populated from SETTING_CHECKBOX_IDS
const checkboxes = new Map<keyof UserSettings, HTMLInputElement | null>();

// Select elements (not checkboxes)
let hltbDisplayStatSelect: HTMLSelectElement | null = null;

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
    const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, ...result.xcpwSettings };

    // Dynamically update all checkboxes from the centralized settings definition
    for (const key of USER_SETTING_KEYS) {
      const checkbox = checkboxes.get(key);
      if (checkbox && typeof settings[key] === 'boolean') {
        checkbox.checked = settings[key] as boolean;
      }
    }

    // Update select elements
    if (hltbDisplayStatSelect) {
      hltbDisplayStatSelect.value = settings.hltbDisplayStat;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading settings:`, error);
  }
}

/**
 * Saves settings to chrome.storage.sync
 */
async function saveSettings(settings: UserSettings): Promise<void> {
  try {
    await chrome.storage.sync.set({ xcpwSettings: settings });
    showSettingsStatus('Settings saved', 'success');
  } catch (error) {
    console.error(`${LOG_PREFIX} Error saving settings:`, error);
    showSettingsStatus('Failed to save settings', 'error');
  }
}

/**
 * Gets current settings from all checkboxes.
 * Dynamically reads from the centralized settings definition.
 */
function getCurrentSettings(): UserSettings {
  const settings = { ...DEFAULT_USER_SETTINGS };
  for (const key of USER_SETTING_KEYS) {
    const checkbox = checkboxes.get(key);
    if (checkbox && typeof DEFAULT_USER_SETTINGS[key] === 'boolean') {
      (settings as Record<string, unknown>)[key] = checkbox.checked;
    }
  }
  // Handle select elements
  if (hltbDisplayStatSelect) {
    settings.hltbDisplayStat = hltbDisplayStatSelect.value as HltbDisplayStat;
  }
  return settings;
}

/**
 * Handles platform toggle change
 */
async function handlePlatformToggle(): Promise<void> {
  const settings = getCurrentSettings();
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

/**
 * Initializes DOM elements and event listeners
 */
function initializePage(): void {
  // Get DOM elements
  statusEl = document.getElementById('status') as HTMLElement;
  settingsStatusEl = document.getElementById('settings-status') as HTMLElement | null;
  cacheCountEl = document.getElementById('cache-count') as HTMLElement;
  cacheAgeEl = document.getElementById('cache-age') as HTMLElement;
  refreshStatsBtn = document.getElementById('refresh-stats-btn') as HTMLButtonElement;
  clearCacheBtn = document.getElementById('clear-cache-btn') as HTMLButtonElement;

  // Dynamically populate checkbox map and add event listeners
  // This automatically includes any new settings added to SETTING_CHECKBOX_IDS
  for (const key of USER_SETTING_KEYS) {
    const checkboxId = SETTING_CHECKBOX_IDS[key];
    if (checkboxId) {
      const checkbox = document.getElementById(checkboxId) as HTMLInputElement | null;
      checkboxes.set(key, checkbox);
      if (checkbox) {
        checkbox.addEventListener('change', handlePlatformToggle);
      }
    }
  }

  // HLTB display stat select
  hltbDisplayStatSelect = document.getElementById('hltb-display-stat') as HTMLSelectElement | null;
  if (hltbDisplayStatSelect) {
    hltbDisplayStatSelect.addEventListener('change', handlePlatformToggle);
  }

  // Event Listeners for buttons
  refreshStatsBtn.addEventListener('click', loadCacheStats);
  clearCacheBtn.addEventListener('click', clearCache);

  // Load initial data, then reveal UI
  Promise.all([loadCacheStats(), loadSettings()]).then(() => {
    // Remove loading class to reveal content with smooth transition
    document.body.classList.remove('is-loading');
  });
}

// Initialize when DOM is ready (or immediately if already loaded)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}
