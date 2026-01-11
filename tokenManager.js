/**
 * Steam Cross-Platform Wishlist - Token Manager
 *
 * Handles Twitch OAuth client credentials flow for IGDB API access.
 * Tokens are stored in chrome.storage.local with expiry tracking.
 * Only communicates with id.twitch.tv for token acquisition.
 */

const TOKEN_STORAGE_KEY = 'xcpw_twitch_token';
const CREDENTIALS_STORAGE_KEY = 'xcpw_twitch_credentials';
const TOKEN_BUFFER_SECONDS = 300; // Refresh 5 minutes before expiry
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

const LOG_PREFIX = '[XCPW TokenManager]';

/**
 * @typedef {Object} StoredToken
 * @property {string} accessToken - The OAuth access token
 * @property {number} expiresAt - Unix timestamp (ms) when token expires
 */

/**
 * @typedef {Object} TwitchCredentials
 * @property {string} clientId - Twitch Client ID
 * @property {string} clientSecret - Twitch Client Secret
 */

/**
 * Gets stored Twitch credentials
 * @returns {Promise<TwitchCredentials | null>}
 */
async function getCredentials() {
  try {
    const result = await chrome.storage.local.get(CREDENTIALS_STORAGE_KEY);
    const creds = result[CREDENTIALS_STORAGE_KEY];
    if (creds?.clientId && creds?.clientSecret) {
      return creds;
    }
    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting credentials:`, error);
    return null;
  }
}

/**
 * Saves Twitch credentials
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<void>}
 */
async function saveCredentials(clientId, clientSecret) {
  await chrome.storage.local.set({
    [CREDENTIALS_STORAGE_KEY]: { clientId, clientSecret }
  });
  // Clear any existing token when credentials change
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
  console.log(`${LOG_PREFIX} Credentials saved`);
}

/**
 * Clears stored credentials and token
 * @returns {Promise<void>}
 */
async function clearCredentials() {
  await chrome.storage.local.remove([CREDENTIALS_STORAGE_KEY, TOKEN_STORAGE_KEY]);
  console.log(`${LOG_PREFIX} Credentials cleared`);
}

/**
 * Gets stored token if valid
 * @returns {Promise<StoredToken | null>}
 */
async function getStoredToken() {
  try {
    const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
    const token = result[TOKEN_STORAGE_KEY];

    if (!token?.accessToken || !token?.expiresAt) {
      return null;
    }

    // Check if token is still valid (with buffer)
    const now = Date.now();
    if (token.expiresAt - (TOKEN_BUFFER_SECONDS * 1000) <= now) {
      console.log(`${LOG_PREFIX} Token expired or expiring soon`);
      return null;
    }

    return token;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting stored token:`, error);
    return null;
  }
}

/**
 * Acquires a new access token from Twitch using client credentials flow
 * @param {TwitchCredentials} credentials
 * @returns {Promise<StoredToken | null>}
 */
async function acquireToken(credentials) {
  try {
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'client_credentials'
    });

    console.log(`${LOG_PREFIX} Acquiring new token from Twitch...`);

    const response = await fetch(TWITCH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} Token acquisition failed: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();

    if (!data.access_token || !data.expires_in) {
      console.error(`${LOG_PREFIX} Invalid token response:`, data);
      return null;
    }

    const token = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000)
    };

    // Store the token
    await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
    console.log(`${LOG_PREFIX} Token acquired, expires in ${data.expires_in} seconds`);

    return token;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error acquiring token:`, error);
    return null;
  }
}

/**
 * Gets a valid access token, acquiring a new one if necessary
 * @returns {Promise<{accessToken: string, clientId: string} | null>}
 */
async function getValidToken() {
  const credentials = await getCredentials();
  if (!credentials) {
    console.log(`${LOG_PREFIX} No credentials configured`);
    return null;
  }

  // Try to use stored token
  let token = await getStoredToken();

  // Acquire new token if needed
  if (!token) {
    token = await acquireToken(credentials);
  }

  if (!token) {
    return null;
  }

  return {
    accessToken: token.accessToken,
    clientId: credentials.clientId
  };
}

/**
 * Tests the connection to Twitch by attempting to acquire a token
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function testConnection() {
  const credentials = await getCredentials();

  if (!credentials) {
    return { success: false, message: 'No credentials configured' };
  }

  // Force acquire a new token to test
  const token = await acquireToken(credentials);

  if (token) {
    return { success: true, message: 'Connection successful' };
  } else {
    return { success: false, message: 'Failed to acquire token. Check your credentials.' };
  }
}

/**
 * Checks if credentials are configured
 * @returns {Promise<boolean>}
 */
async function hasCredentials() {
  const credentials = await getCredentials();
  return credentials !== null;
}

// Export for service worker
globalThis.XCPW_TokenManager = {
  getCredentials,
  saveCredentials,
  clearCredentials,
  getValidToken,
  testConnection,
  hasCredentials
};
