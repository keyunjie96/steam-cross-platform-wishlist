/**
 * Steam Cross-Platform Wishlist - Options Page
 *
 * Handles the options UI for managing the cache.
 */

import type { UserSettings } from './types';

// Constants
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const LOG_PREFIX = '[SCPW Options]';

// Get centralized settings definitions from types.ts
const { DEFAULT_USER_SETTINGS, SETTING_CHECKBOX_IDS, SETTING_SELECT_IDS, USER_SETTING_KEYS } = globalThis.SCPW_UserSettings;

// DOM Elements (initialized in DOMContentLoaded)
let cacheStatusEl: HTMLElement;
let settingsStatusEl: HTMLElement | null;
let cacheCountEl: HTMLElement;
let cacheAgeEl: HTMLElement;
let refreshStatsBtn: HTMLButtonElement;
let clearCacheBtn: HTMLButtonElement;
let exportCacheBtn: HTMLButtonElement;

// Dynamic checkbox map - populated from SETTING_CHECKBOX_IDS
const checkboxes = new Map<keyof UserSettings, HTMLInputElement | null>();

// Dynamic select elements map - populated from SETTING_SELECT_IDS
interface SelectElementEntry {
  select: HTMLSelectElement | null;
  row: HTMLElement | null;
  visibilityKey: keyof UserSettings;
}
const selectElements = new Map<keyof UserSettings, SelectElementEntry>();

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
 * Shows a status message for cache operations
 */
function showCacheStatus(message: string, type: 'success' | 'error'): void {
  cacheStatusEl.textContent = message;
  cacheStatusEl.className = `status ${type}`;
}

/**
 * Shows a status message for settings
 */
function showSettingsStatus(message: string, type: 'success' | 'error'): void {
  if (!settingsStatusEl) return;

  settingsStatusEl.textContent = message;
  settingsStatusEl.className = `status ${type}`;
  // Auto-hide after 2 seconds
  setTimeout(() => {
    if (settingsStatusEl) {
      settingsStatusEl.className = 'status';
    }
  }, 2000);
}

/**
 * Loads settings from chrome.storage.sync
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get('scpwSettings');
    const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, ...result.scpwSettings };

    // Dynamically update all checkboxes from the centralized settings definition
    for (const key of USER_SETTING_KEYS) {
      const checkbox = checkboxes.get(key);
      if (checkbox && typeof settings[key] === 'boolean') {
        checkbox.checked = settings[key] as boolean;
      }
    }

    // Dynamically update all select elements from SETTING_SELECT_IDS
    for (const [key, entry] of selectElements) {
      if (entry.select && settings[key] !== undefined) {
        entry.select.value = settings[key] as string;
      }
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
    await chrome.storage.sync.set({ scpwSettings: settings });
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

  // Dynamically read all checkbox values
  for (const key of USER_SETTING_KEYS) {
    const checkbox = checkboxes.get(key);
    if (checkbox && typeof DEFAULT_USER_SETTINGS[key] === 'boolean') {
      (settings as Record<string, unknown>)[key] = checkbox.checked;
    }
  }

  // Dynamically read all select element values
  for (const [key, entry] of selectElements) {
    if (entry.select) {
      (settings as Record<string, unknown>)[key] = entry.select.value;
    }
  }

  return settings;
}

/**
 * Updates visibility of all select elements based on their associated checkbox state.
 * Uses SETTING_SELECT_IDS.visibilityKey to determine which checkbox controls each select.
 */
function updateSelectVisibilities(): void {
  for (const [, entry] of selectElements) {
    const checkbox = checkboxes.get(entry.visibilityKey);
    if (entry.select && checkbox) {
      const shouldShow = checkbox.checked;
      entry.select.hidden = !shouldShow;
      if (entry.row) {
        entry.row.classList.toggle('inline-select-hidden', !shouldShow);
      }
    }
  }
}

/**
 * Updates the visual active state of all platform toggles
 */
function updateToggleActiveStates(): void {
  for (const [, checkbox] of checkboxes) {
    if (checkbox) {
      // Support multiple class names: .platform-toggle, .option-item, .toggle-item
      const toggleLabel = checkbox.closest('.platform-toggle') || checkbox.closest('.option-item') || checkbox.closest('.toggle-item');
      if (toggleLabel) {
        toggleLabel.classList.toggle('active', checkbox.checked);
      }
    }
  }
}

/**
 * Handles platform toggle change
 */
async function handlePlatformToggle(): Promise<void> {
  updateToggleActiveStates();
  updateSelectVisibilities();
  const settings = getCurrentSettings();
  await saveSettings(settings);
}

/**
 * Sets loading state on a button
 */
function setButtonLoading(button: HTMLButtonElement, loading: boolean): void {
  button.disabled = loading;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = '<span class="loading"></span>Loading...';
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
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
      showCacheStatus('Cache cleared successfully.', 'success');
      await loadCacheStats();
    } else {
      showCacheStatus('Failed to clear cache.', 'error');
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error clearing cache:`, error);
    showCacheStatus('Failed to clear cache.', 'error');
  } finally {
    setButtonLoading(clearCacheBtn, false);
  }
}

interface CacheExportResponse {
  success: boolean;
  data?: unknown;
}

/**
 * Exports all cache entries as a JSON file download
 */
async function exportCache(): Promise<void> {
  setButtonLoading(exportCacheBtn, true);

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CACHE_EXPORT' }) as CacheExportResponse;

    if (!response?.success || !response.data) {
      showCacheStatus('Failed to export cache.', 'error');
      return;
    }

    const entries = response.data as Array<Record<string, unknown>>;
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      entryCount: entries.length,
      entries
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scpw-cache-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showCacheStatus(`Exported ${entries.length} cached entries.`, 'success');
  } catch (error) {
    console.error(`${LOG_PREFIX} Error exporting cache:`, error);
    showCacheStatus('Failed to export cache.', 'error');
  } finally {
    setButtonLoading(exportCacheBtn, false);
  }
}

/**
 * Initializes collapsible sections (CSP-compliant, no inline onclick)
 */
function initializeCollapsibleSections(): void {
  document.querySelectorAll<HTMLElement>('section[data-collapsible] .collapse-btn').forEach((btn) => {
    const bodyId = btn.getAttribute('aria-controls');
    if (!bodyId) return;

    const body = document.getElementById(bodyId);
    const section = btn.closest('section');
    if (!body || !section) return;

    const setCollapsed = (collapsed: boolean): void => {
      section.classList.toggle('collapsed', collapsed);
      btn.setAttribute('aria-expanded', String(!collapsed));
      body.hidden = collapsed;
    };

    // Set initial state from markup
    setCollapsed(section.classList.contains('collapsed'));

    btn.addEventListener('click', () => {
      const isCollapsed = section.classList.contains('collapsed');
      setCollapsed(!isCollapsed);
    });
  });
}

/**
 * Initializes DOM elements and event listeners
 */
function initializePage(): void {
  // Get DOM elements
  cacheStatusEl = document.getElementById('cache-status') as HTMLElement;
  settingsStatusEl = document.getElementById('settings-status') as HTMLElement | null;
  cacheCountEl = document.getElementById('cache-count') as HTMLElement;
  cacheAgeEl = document.getElementById('cache-age') as HTMLElement;
  refreshStatsBtn = document.getElementById('refresh-stats-btn') as HTMLButtonElement;
  clearCacheBtn = document.getElementById('clear-cache-btn') as HTMLButtonElement;
  exportCacheBtn = document.getElementById('export-cache-btn') as HTMLButtonElement;

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

  // Dynamically populate select elements map and add event listeners
  // This automatically includes any new selects added to SETTING_SELECT_IDS
  for (const key of USER_SETTING_KEYS) {
    const config = SETTING_SELECT_IDS[key];
    if (config) {
      const select = document.getElementById(config.elementId) as HTMLSelectElement | null;
      // Find the row element by looking for the parent toggle-item of the visibility checkbox
      const visibilityCheckbox = checkboxes.get(config.visibilityKey);
      const row = visibilityCheckbox
        ? visibilityCheckbox.closest('.toggle-item.has-inline-option') as HTMLElement | null
        : null;

      selectElements.set(key, {
        select,
        row,
        visibilityKey: config.visibilityKey
      });

      if (select) {
        select.addEventListener('change', handlePlatformToggle);
      }
    }
  }

  // Initialize collapsible sections (CSP-compliant)
  initializeCollapsibleSections();

  // Event Listeners for buttons
  refreshStatsBtn.addEventListener('click', loadCacheStats);
  clearCacheBtn.addEventListener('click', clearCache);
  exportCacheBtn.addEventListener('click', exportCache);

  // Load initial data, then reveal UI
  Promise.all([loadCacheStats(), loadSettings()]).then(() => {
    // Update toggle active states and select visibility based on loaded settings
    updateToggleActiveStates();
    updateSelectVisibilities();
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
