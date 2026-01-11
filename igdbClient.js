/**
 * Steam Cross-Platform Wishlist - IGDB Client
 *
 * Handles all communication with the IGDB API.
 * Only calls api.igdb.com. Implements rate limiting and batching.
 */

const IGDB_API_URL = 'https://api.igdb.com/v4';
const LOG_PREFIX = '[XCPW IGDB]';

// Rate limiting configuration
const MAX_CONCURRENT_REQUESTS = 4;
const REQUEST_DELAY_MS = 250; // 4 requests per second max
const BATCH_SIZE = 10; // Process games in batches

// IGDB Platform IDs
// https://api-docs.igdb.com/#platform
const PLATFORM_IDS = {
  // Nintendo Switch
  SWITCH: 130,

  // PlayStation
  PS4: 48,
  PS5: 167,

  // Xbox
  XBOX_ONE: 49,
  XBOX_SERIES: 169
};

// IGDB External Game Category IDs
// https://api-docs.igdb.com/#external-game
const EXTERNAL_GAME_CATEGORY = {
  STEAM: 1
};

// IGDB Website Category IDs
// https://api-docs.igdb.com/#website
const WEBSITE_CATEGORY = {
  OFFICIAL: 1,
  ESHOP: 16,      // Nintendo eShop
  PLAYSTATION: 36, // PlayStation Store (unofficial, may vary)
  XBOX: 37         // Xbox Store (unofficial, may vary)
};

// Queue for managing concurrent requests
let requestQueue = [];
let activeRequests = 0;
let lastRequestTime = 0;

/**
 * @typedef {Object} IGDBGame
 * @property {number} id - IGDB game ID
 * @property {string} name - Game name
 * @property {number[]} [platforms] - Array of platform IDs
 * @property {Object[]} [external_games] - External game references
 * @property {Object[]} [websites] - Website references
 */

/**
 * @typedef {Object} PlatformResult
 * @property {boolean} available - Whether the game is available
 * @property {string | null} storeUrl - Official store URL if found
 */

/**
 * @typedef {Object} IGDBResolution
 * @property {number | null} igdbId - IGDB game ID
 * @property {string} gameName - Game name from IGDB
 * @property {PlatformResult} nintendo - Nintendo Switch availability
 * @property {PlatformResult} playstation - PlayStation (PS4/PS5) availability
 * @property {PlatformResult} xbox - Xbox (One/Series) availability
 * @property {boolean} found - Whether the game was found in IGDB
 */

/**
 * Delays execution to respect rate limits
 * @returns {Promise<void>}
 */
async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise(resolve =>
      setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
}

/**
 * Makes a rate-limited request to IGDB API
 * @param {string} endpoint - API endpoint (e.g., 'games')
 * @param {string} query - Apicalypse query
 * @param {string} accessToken - OAuth access token
 * @param {string} clientId - Twitch Client ID
 * @returns {Promise<Object[] | null>}
 */
async function makeRequest(endpoint, query, accessToken, clientId) {
  await rateLimit();

  try {
    const response = await fetch(`${IGDB_API_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain'
      },
      body: query
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} API error (${response.status}):`, errorText);

      // Handle rate limiting
      if (response.status === 429) {
        console.warn(`${LOG_PREFIX} Rate limited, waiting before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return makeRequest(endpoint, query, accessToken, clientId);
      }

      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`${LOG_PREFIX} Request error:`, error);
    return null;
  }
}

/**
 * Resolves a Steam appid to IGDB game data
 * @param {string} steamAppId - Steam application ID
 * @param {string} accessToken - OAuth access token
 * @param {string} clientId - Twitch Client ID
 * @returns {Promise<IGDBGame | null>}
 */
async function lookupBySteamId(steamAppId, accessToken, clientId) {
  // Query IGDB for games with this Steam external ID
  // We need to use the external_games endpoint or query games with external_games expanded
  const query = `
    fields name, platforms, websites.url, websites.category, external_games.uid, external_games.category;
    where external_games.uid = "${steamAppId}" & external_games.category = ${EXTERNAL_GAME_CATEGORY.STEAM};
    limit 1;
  `;

  const results = await makeRequest('games', query, accessToken, clientId);

  if (!results || results.length === 0) {
    console.log(`${LOG_PREFIX} No IGDB match for Steam appid ${steamAppId}`);
    return null;
  }

  return results[0];
}

/**
 * Batch lookup multiple Steam appids
 * @param {string[]} steamAppIds - Array of Steam application IDs
 * @param {string} accessToken - OAuth access token
 * @param {string} clientId - Twitch Client ID
 * @returns {Promise<Map<string, IGDBGame>>}
 */
async function batchLookupBySteamIds(steamAppIds, accessToken, clientId) {
  const results = new Map();

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < steamAppIds.length; i += BATCH_SIZE) {
    const batch = steamAppIds.slice(i, i + BATCH_SIZE);

    // Build OR conditions for the query
    const conditions = batch.map(id =>
      `(external_games.uid = "${id}" & external_games.category = ${EXTERNAL_GAME_CATEGORY.STEAM})`
    ).join(' | ');

    const query = `
      fields name, platforms, websites.url, websites.category, external_games.uid, external_games.category;
      where ${conditions};
      limit ${BATCH_SIZE};
    `;

    const batchResults = await makeRequest('games', query, accessToken, clientId);

    if (batchResults) {
      for (const game of batchResults) {
        // Find the Steam appid for this game
        const steamExternal = game.external_games?.find(
          eg => eg.category === EXTERNAL_GAME_CATEGORY.STEAM
        );
        if (steamExternal?.uid) {
          results.set(steamExternal.uid, game);
        }
      }
    }

    // Log progress for larger batches
    if (steamAppIds.length > BATCH_SIZE) {
      console.log(`${LOG_PREFIX} Batch progress: ${Math.min(i + BATCH_SIZE, steamAppIds.length)}/${steamAppIds.length}`);
    }
  }

  return results;
}

/**
 * Checks if a game has a specific platform
 * @param {IGDBGame} game - IGDB game data
 * @param {number[]} platformIds - Platform IDs to check
 * @returns {boolean}
 */
function hasPlatform(game, platformIds) {
  if (!game.platforms || !Array.isArray(game.platforms)) {
    return false;
  }
  return game.platforms.some(pid => platformIds.includes(pid));
}

/**
 * Finds the best store URL for a platform
 * @param {IGDBGame} game - IGDB game data
 * @param {number} websiteCategory - Website category to look for
 * @returns {string | null}
 */
function findStoreUrl(game, websiteCategory) {
  if (!game.websites || !Array.isArray(game.websites)) {
    return null;
  }

  const website = game.websites.find(w => w.category === websiteCategory);
  return website?.url || null;
}

/**
 * Resolves a Steam appid to platform availability information
 * @param {string} steamAppId - Steam application ID
 * @param {string} gameName - Game name (for fallback)
 * @param {string} accessToken - OAuth access token
 * @param {string} clientId - Twitch Client ID
 * @returns {Promise<IGDBResolution>}
 */
async function resolvePlatformAvailability(steamAppId, gameName, accessToken, clientId) {
  const game = await lookupBySteamId(steamAppId, accessToken, clientId);

  if (!game) {
    return {
      igdbId: null,
      gameName: gameName,
      nintendo: { available: false, storeUrl: null },
      playstation: { available: false, storeUrl: null },
      xbox: { available: false, storeUrl: null },
      found: false
    };
  }

  // Check platform availability
  const hasSwitch = hasPlatform(game, [PLATFORM_IDS.SWITCH]);
  const hasPlayStation = hasPlatform(game, [PLATFORM_IDS.PS4, PLATFORM_IDS.PS5]);
  const hasXbox = hasPlatform(game, [PLATFORM_IDS.XBOX_ONE, PLATFORM_IDS.XBOX_SERIES]);

  // Find store URLs (prefer official stores)
  const nintendoUrl = findStoreUrl(game, WEBSITE_CATEGORY.ESHOP);
  const playstationUrl = findStoreUrl(game, WEBSITE_CATEGORY.PLAYSTATION);
  const xboxUrl = findStoreUrl(game, WEBSITE_CATEGORY.XBOX);

  console.log(`${LOG_PREFIX} Resolved ${steamAppId} -> IGDB ${game.id}: NS=${hasSwitch}, PS=${hasPlayStation}, XB=${hasXbox}`);

  return {
    igdbId: game.id,
    gameName: game.name || gameName,
    nintendo: { available: hasSwitch, storeUrl: nintendoUrl },
    playstation: { available: hasPlayStation, storeUrl: playstationUrl },
    xbox: { available: hasXbox, storeUrl: xboxUrl },
    found: true
  };
}

/**
 * Batch resolves multiple Steam appids to platform availability
 * @param {Array<{appid: string, gameName: string}>} games - Array of game info
 * @param {string} accessToken - OAuth access token
 * @param {string} clientId - Twitch Client ID
 * @returns {Promise<Map<string, IGDBResolution>>}
 */
async function batchResolvePlatformAvailability(games, accessToken, clientId) {
  const results = new Map();
  const appIds = games.map(g => g.appid);
  const gameNameMap = new Map(games.map(g => [g.appid, g.gameName]));

  const igdbGames = await batchLookupBySteamIds(appIds, accessToken, clientId);

  for (const { appid, gameName } of games) {
    const game = igdbGames.get(appid);

    if (!game) {
      results.set(appid, {
        igdbId: null,
        gameName: gameName,
        nintendo: { available: false, storeUrl: null },
        playstation: { available: false, storeUrl: null },
        xbox: { available: false, storeUrl: null },
        found: false
      });
      continue;
    }

    const hasSwitch = hasPlatform(game, [PLATFORM_IDS.SWITCH]);
    const hasPlayStation = hasPlatform(game, [PLATFORM_IDS.PS4, PLATFORM_IDS.PS5]);
    const hasXbox = hasPlatform(game, [PLATFORM_IDS.XBOX_ONE, PLATFORM_IDS.XBOX_SERIES]);

    const nintendoUrl = findStoreUrl(game, WEBSITE_CATEGORY.ESHOP);
    const playstationUrl = findStoreUrl(game, WEBSITE_CATEGORY.PLAYSTATION);
    const xboxUrl = findStoreUrl(game, WEBSITE_CATEGORY.XBOX);

    results.set(appid, {
      igdbId: game.id,
      gameName: game.name || gameName,
      nintendo: { available: hasSwitch, storeUrl: nintendoUrl },
      playstation: { available: hasPlayStation, storeUrl: playstationUrl },
      xbox: { available: hasXbox, storeUrl: xboxUrl },
      found: true
    });

    console.log(`${LOG_PREFIX} Batch resolved ${appid}: NS=${hasSwitch}, PS=${hasPlayStation}, XB=${hasXbox}`);
  }

  return results;
}

/**
 * Tests the IGDB connection by making a simple query
 * @param {string} accessToken - OAuth access token
 * @param {string} clientId - Twitch Client ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function testConnection(accessToken, clientId) {
  try {
    const query = 'fields name; limit 1;';
    const result = await makeRequest('games', query, accessToken, clientId);

    if (result && Array.isArray(result)) {
      return { success: true, message: 'IGDB connection successful' };
    }
    return { success: false, message: 'Unexpected response from IGDB' };
  } catch (error) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

// Export for service worker
globalThis.XCPW_IGDBClient = {
  resolvePlatformAvailability,
  batchResolvePlatformAvailability,
  testConnection,
  lookupBySteamId,
  PLATFORM_IDS
};
