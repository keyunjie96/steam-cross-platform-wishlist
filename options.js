/**
 * Steam Cross-Platform Wishlist - Options Page
 *
 * Handles the options UI for managing the cache.
 */

// Constants
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

// DOM Elements
const statusEl = document.getElementById('status');
const cacheCountEl = document.getElementById('cache-count');
const cacheAgeEl = document.getElementById('cache-age');
const refreshStatsBtn = document.getElementById('refresh-stats-btn');
const clearCacheBtn = document.getElementById('clear-cache-btn');

/**
 * Formats a duration in milliseconds to a human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string}
 */
function formatAge(ms) {
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
 * @param {string} message
 * @param {'success' | 'error'} type
 */
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

/**
 * Sets loading state on a button
 * @param {HTMLButtonElement} button
 * @param {boolean} loading
 */
function setButtonLoading(button, loading) {
  button.disabled = loading;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.innerHTML = '<span class="loading"></span>Loading...';
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
}

/**
 * Loads and displays cache statistics
 */
async function loadCacheStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CACHE_STATS' });

    if (response?.success) {
      cacheCountEl.textContent = response.count.toString();
      cacheAgeEl.textContent = response.oldestEntry
        ? formatAge(Date.now() - response.oldestEntry)
        : '-';
    }
  } catch (error) {
    console.error('Error loading cache stats:', error);
    cacheCountEl.textContent = '?';
    cacheAgeEl.textContent = '?';
  }
}

/**
 * Clears the cache after user confirmation
 */
async function clearCache() {
  const confirmed = confirm('Are you sure you want to clear the cache? All games will need to be re-resolved.');
  if (!confirmed) {
    return;
  }

  setButtonLoading(clearCacheBtn, true);

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });

    if (response?.success) {
      showStatus('Cache cleared successfully.', 'success');
      await loadCacheStats();
    } else {
      showStatus('Failed to clear cache.', 'error');
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    showStatus('Failed to clear cache.', 'error');
  } finally {
    setButtonLoading(clearCacheBtn, false);
  }
}

// Event Listeners
refreshStatsBtn.addEventListener('click', loadCacheStats);
clearCacheBtn.addEventListener('click', clearCache);

// Initialize
document.addEventListener('DOMContentLoaded', loadCacheStats);
