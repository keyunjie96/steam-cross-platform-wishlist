/**
 * Steam Cross-Platform Wishlist - Options Page
 *
 * Handles the options UI for configuring Twitch/IGDB credentials
 * and managing the cache.
 */

const CREDENTIALS_STORAGE_KEY = 'xcpw_twitch_credentials';
const CACHE_KEY_PREFIX = 'xcpw_cache_';

// DOM Elements
const form = document.getElementById('credentials-form');
const clientIdInput = document.getElementById('client-id');
const clientSecretInput = document.getElementById('client-secret');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');
const cacheCountEl = document.getElementById('cache-count');
const cacheAgeEl = document.getElementById('cache-age');
const refreshStatsBtn = document.getElementById('refresh-stats-btn');
const clearCacheBtn = document.getElementById('clear-cache-btn');

/**
 * Shows a status message
 * @param {string} message
 * @param {'success' | 'error' | 'info'} type
 */
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

/**
 * Clears the status message
 */
function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = 'status';
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
 * Loads saved credentials into the form
 */
async function loadCredentials() {
  try {
    const result = await chrome.storage.local.get(CREDENTIALS_STORAGE_KEY);
    const creds = result[CREDENTIALS_STORAGE_KEY];

    if (creds?.clientId) {
      clientIdInput.value = creds.clientId;
    }
    if (creds?.clientSecret) {
      // Show masked secret
      clientSecretInput.value = creds.clientSecret;
    }
  } catch (error) {
    console.error('Error loading credentials:', error);
  }
}

/**
 * Saves credentials to storage
 */
async function saveCredentials() {
  const clientId = clientIdInput.value.trim();
  const clientSecret = clientSecretInput.value.trim();

  if (!clientId || !clientSecret) {
    showStatus('Please enter both Client ID and Client Secret.', 'error');
    return;
  }

  setButtonLoading(saveBtn, true);
  clearStatus();

  try {
    // Send message to background to save credentials
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_CREDENTIALS',
      clientId,
      clientSecret
    });

    if (response?.success) {
      showStatus('Credentials saved successfully.', 'success');
    } else {
      showStatus(response?.error || 'Failed to save credentials.', 'error');
    }
  } catch (error) {
    console.error('Error saving credentials:', error);
    showStatus('Failed to save credentials.', 'error');
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

/**
 * Tests the connection with current credentials
 */
async function testConnection() {
  const clientId = clientIdInput.value.trim();
  const clientSecret = clientSecretInput.value.trim();

  if (!clientId || !clientSecret) {
    showStatus('Please enter credentials first.', 'error');
    return;
  }

  setButtonLoading(testBtn, true);
  showStatus('Testing connection...', 'info');

  try {
    // First save credentials if they changed
    await chrome.runtime.sendMessage({
      type: 'SAVE_CREDENTIALS',
      clientId,
      clientSecret
    });

    // Then test connection
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_CONNECTION'
    });

    if (response?.success) {
      showStatus('Connection successful! IGDB integration is ready.', 'success');
    } else {
      showStatus(response?.message || 'Connection failed. Check your credentials.', 'error');
    }
  } catch (error) {
    console.error('Error testing connection:', error);
    showStatus('Connection test failed.', 'error');
  } finally {
    setButtonLoading(testBtn, false);
  }
}

/**
 * Clears saved credentials
 */
async function clearCredentials() {
  if (!confirm('Are you sure you want to clear your credentials?')) {
    return;
  }

  setButtonLoading(clearBtn, true);
  clearStatus();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_CREDENTIALS'
    });

    if (response?.success) {
      clientIdInput.value = '';
      clientSecretInput.value = '';
      showStatus('Credentials cleared.', 'success');
    } else {
      showStatus('Failed to clear credentials.', 'error');
    }
  } catch (error) {
    console.error('Error clearing credentials:', error);
    showStatus('Failed to clear credentials.', 'error');
  } finally {
    setButtonLoading(clearBtn, false);
  }
}

/**
 * Loads cache statistics
 */
async function loadCacheStats() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CACHE_STATS'
    });

    if (response?.success) {
      cacheCountEl.textContent = response.count.toString();

      if (response.oldestEntry) {
        const age = Date.now() - response.oldestEntry;
        const days = Math.floor(age / (1000 * 60 * 60 * 24));
        const hours = Math.floor((age % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) {
          cacheAgeEl.textContent = `${days}d ${hours}h`;
        } else if (hours > 0) {
          cacheAgeEl.textContent = `${hours}h`;
        } else {
          cacheAgeEl.textContent = '<1h';
        }
      } else {
        cacheAgeEl.textContent = '-';
      }
    }
  } catch (error) {
    console.error('Error loading cache stats:', error);
    cacheCountEl.textContent = '?';
    cacheAgeEl.textContent = '?';
  }
}

/**
 * Clears the cache
 */
async function clearCache() {
  if (!confirm('Are you sure you want to clear the cache? All games will need to be re-resolved.')) {
    return;
  }

  setButtonLoading(clearCacheBtn, true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_CACHE'
    });

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
form.addEventListener('submit', (e) => {
  e.preventDefault();
  saveCredentials();
});

testBtn.addEventListener('click', testConnection);
clearBtn.addEventListener('click', clearCredentials);
refreshStatsBtn.addEventListener('click', loadCacheStats);
clearCacheBtn.addEventListener('click', clearCache);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCredentials();
  loadCacheStats();
});
