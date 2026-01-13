/**
 * Steam Cross-Platform Wishlist - Wikidata Client
 *
 * Queries Wikidata SPARQL endpoint for platform availability data.
 * No authentication required - works out of the box.
 * Only calls query.wikidata.org.
 */

const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
const WIKIDATA_LOG_PREFIX = '[XCPW Wikidata]';
const WIKIDATA_DEBUG = false;

const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

let requestQueue = Promise.resolve();

const PLATFORM_QIDS = {
  SWITCH: 'Q19610114',
  PS4: 'Q5014725',
  PS5: 'Q63184502',
  XBOX_ONE: 'Q13361286',
  XBOX_SERIES_X: 'Q64513817',
  XBOX_SERIES_S: 'Q98973368',
  WINDOWS: 'Q1406',
  MACOS: 'Q14116',
  LINUX: 'Q388',
  IOS: 'Q48493',
  ANDROID: 'Q94'
};

const PROPERTIES = {
  STEAM_APP_ID: 'P1733',
  PLATFORM: 'P400',
  GOG_ID: 'P2725',
  EPIC_ID: 'P6278',
  PS_STORE_ID: 'P12069',
  XBOX_ID: 'P12465',
  ESHOP_ID: 'P8956',
  APP_STORE_ID: 'P3861',
  PLAY_STORE_ID: 'P3418',
  ITCH_ID: 'P7294',
  SWITCH_TITLE_ID: 'P11072',
  ESHOP_EUROPE_ID: 'P12418',
  ESHOP_US_ID: 'P8084',
  NINTENDO_LIFE_GAME_ID: 'P12735',
  PS_STORE_EU: 'P5971',
  PS_STORE_JP: 'P5999',
  PS_STORE_NA: 'P5944',
  PS_STORE_CONCEPT: 'P12332',
  PUSH_SQUARE_ID: 'P12736',
  MS_STORE_ID: 'P5885',
  PURE_XBOX_ID: 'P12737',
  XBOX_360_STORE: 'P11789'
};

const SPARQL_SELECT_FIELDS = `
  (GROUP_CONCAT(DISTINCT ?platformQID; separator=",") AS ?platforms)
  (SAMPLE(?eshopId) AS ?eshop) (SAMPLE(?psStoreId) AS ?psStore) (SAMPLE(?xboxId) AS ?xbox)
  (SAMPLE(?gogId) AS ?gog) (SAMPLE(?epicId) AS ?epic)
  (SAMPLE(?appStoreId) AS ?appStore) (SAMPLE(?playStoreId) AS ?playStore)
  (SAMPLE(?switchTitleId) AS ?switchTitle) (SAMPLE(?eshopEuId) AS ?eshopEu) (SAMPLE(?eshopUsId) AS ?eshopUs)
  (SAMPLE(?psStoreEuId) AS ?psStoreEu) (SAMPLE(?psStoreNaId) AS ?psStoreNa) (SAMPLE(?psStoreConceptId) AS ?psStoreConcept)
  (SAMPLE(?msStoreId) AS ?msStore) (SAMPLE(?pureXboxId) AS ?pureXbox)`;

const SPARQL_OPTIONAL_CLAUSES = `
  OPTIONAL { ?game wdt:${PROPERTIES.PLATFORM} ?platform . BIND(STRAFTER(STR(?platform), "entity/") AS ?platformQID) }
  OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_ID} ?eshopId . }
  OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_ID} ?psStoreId . }
  OPTIONAL { ?game wdt:${PROPERTIES.XBOX_ID} ?xboxId . }
  OPTIONAL { ?game wdt:${PROPERTIES.GOG_ID} ?gogId . }
  OPTIONAL { ?game wdt:${PROPERTIES.EPIC_ID} ?epicId . }
  OPTIONAL { ?game wdt:${PROPERTIES.APP_STORE_ID} ?appStoreId . }
  OPTIONAL { ?game wdt:${PROPERTIES.PLAY_STORE_ID} ?playStoreId . }
  OPTIONAL { ?game wdt:${PROPERTIES.SWITCH_TITLE_ID} ?switchTitleId . }
  OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_EUROPE_ID} ?eshopEuId . }
  OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_US_ID} ?eshopUsId . }
  OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_EU} ?psStoreEuId . }
  OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_NA} ?psStoreNaId . }
  OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_CONCEPT} ?psStoreConceptId . }
  OPTIONAL { ?game wdt:${PROPERTIES.MS_STORE_ID} ?msStoreId . }
  OPTIONAL { ?game wdt:${PROPERTIES.PURE_XBOX_ID} ?pureXboxId . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`;

const PLATFORM_STORE_ID_MAP = {
  nintendo: 'eshop',
  playstation: 'psStore',
  xbox: 'xbox'
};

const STORE_URL_TEMPLATES = {
  nintendo: 'https://www.nintendo.com/store/products/{id}/',
  playstation: 'https://store.playstation.com/concept/{id}',
  xbox: 'https://www.xbox.com/games/store/-/{id}',
  gog: 'https://www.gog.com/game/{id}',
  epic: 'https://store.epicgames.com/p/{id}',
  appStore: 'https://apps.apple.com/app/id{id}',
  playStore: 'https://play.google.com/store/apps/details?id={id}',
  itch: 'https://{id}.itch.io/'
};

function buildStoreUrl(store, id) {
  if (!id || !STORE_URL_TEMPLATES[store]) return null;
  return STORE_URL_TEMPLATES[store].replace('{id}', id);
}

const STORE_URL_BUILDERS = {
  nintendo: (id) => buildStoreUrl('nintendo', id),
  playstation: (id) => buildStoreUrl('playstation', id),
  xbox: (id) => buildStoreUrl('xbox', id),
  gog: (id) => buildStoreUrl('gog', id),
  epic: (id) => buildStoreUrl('epic', id),
  appStore: (id) => buildStoreUrl('appStore', id),
  playStore: (id) => buildStoreUrl('playStore', id),
  itch: (id) => buildStoreUrl('itch', id)
};

/**
 * @typedef {Object} WikidataResult
 * @property {string | null} wikidataId - Wikidata QID
 * @property {string} gameName - Game name from Wikidata
 * @property {boolean} found - Whether the game was found
 * @property {Object} platforms - Platform availability
 * @property {boolean} platforms.nintendo - Nintendo Switch availability
 * @property {boolean} platforms.playstation - PS4/PS5 availability
 * @property {boolean} platforms.xbox - Xbox One/Series availability
 * @property {Object} storeIds - Store IDs for URL construction
 * @property {string | null} storeIds.eshop - Nintendo eShop ID
 * @property {string | null} storeIds.psStore - PlayStation Store ID
 * @property {string | null} storeIds.xbox - Xbox Store ID
 * @property {string | null} storeIds.gog - GOG ID
 * @property {string | null} storeIds.epic - Epic Games Store ID
 */

const EMPTY_RESULT = {
  wikidataId: null,
  gameName: '',
  found: false,
  platforms: { nintendo: false, playstation: false, xbox: false },
  storeIds: { eshop: null, psStore: null, xbox: null, gog: null, epic: null, appStore: null, playStore: null }
};

function createEmptyResult() {
  return { ...EMPTY_RESULT, platforms: { ...EMPTY_RESULT.platforms }, storeIds: { ...EMPTY_RESULT.storeIds } };
}

/**
 * Extracts platform availability and store IDs from a SPARQL binding
 * @param {Object} binding - SPARQL result binding
 * @returns {WikidataResult}
 */
function parseBindingToResult(binding) {
  const platformQIDs = binding.platforms?.value?.split(',') || [];

  const hasSwitchP400 = platformQIDs.includes(PLATFORM_QIDS.SWITCH);
  const hasPSP400 = platformQIDs.includes(PLATFORM_QIDS.PS4) || platformQIDs.includes(PLATFORM_QIDS.PS5);
  const hasXboxP400 = platformQIDs.includes(PLATFORM_QIDS.XBOX_ONE) ||
                      platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_X) ||
                      platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_S);

  const hasSwitchStoreId = !!(binding.switchTitle?.value || binding.eshopEu?.value || binding.eshopUs?.value);
  const hasPSStoreId = !!(binding.psStoreEu?.value || binding.psStoreNa?.value ||
                          binding.psStoreConcept?.value || binding.psStore?.value);

  const pureXboxId = binding.pureXbox?.value;
  const isPureXboxConsole = pureXboxId && !pureXboxId.includes('xbox-for-pc') && !pureXboxId.includes('-for-pc');
  const hasXboxStoreId = !!(binding.msStore?.value || isPureXboxConsole || binding.xbox?.value);

  const wikidataId = binding.game?.value ? binding.game.value.split('/').pop() : null;

  return {
    wikidataId,
    gameName: binding.gameLabel?.value || '',
    found: true,
    platforms: {
      nintendo: hasSwitchP400 || hasSwitchStoreId,
      playstation: hasPSP400 || hasPSStoreId,
      xbox: hasXboxP400 || hasXboxStoreId
    },
    storeIds: {
      eshop: binding.eshopUs?.value || binding.eshopEu?.value || null,
      psStore: binding.psStoreConcept?.value || binding.psStoreNa?.value || binding.psStoreEu?.value || binding.psStore?.value || null,
      xbox: binding.msStore?.value || binding.xbox?.value || null,
      gog: binding.gog?.value || null,
      epic: binding.epic?.value || null,
      appStore: binding.appStore?.value || null,
      playStore: binding.playStore?.value || null
    }
  };
}

/**
 * Serializes requests through a queue to prevent concurrent bursts.
 * @returns {Promise<void>}
 */
async function rateLimit() {
  const myTurn = requestQueue.then(() => new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS)));
  requestQueue = myTurn.catch(() => {});
  await myTurn;
}

/**
 * Executes a SPARQL query against Wikidata with retry logic.
 * Fails silently - errors are caught and return null.
 * @param {string} query - SPARQL query
 * @param {number} retryCount - Current retry attempt (internal)
 * @returns {Promise<Object | null>}
 */
async function executeSparqlQuery(query, retryCount = 0) {
  await rateLimit();

  try {
    const url = new URL(WIKIDATA_SPARQL_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('format', 'json');

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'SteamCrossPlatformWishlist/0.5.0 (Chrome Extension)'
      }
    });

    // Handle rate limiting with exponential backoff (silent retry)
    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return executeSparqlQuery(query, retryCount + 1);
      }
      // Max retries exceeded - fail silently, will retry on next page load
      return null;
    }

    if (!response.ok) {
      // Non-429 errors - fail silently
      return null;
    }

    return await response.json();
  } catch (error) {
    // Network errors - fail silently
    return null;
  }
}

/**
 * Queries Wikidata for a game by Steam App ID
 * @param {string} steamAppId - Steam application ID
 * @returns {Promise<WikidataResult>}
 * @throws {Error} When query fails due to network/rate limit (caller should NOT cache)
 */
async function queryBySteamAppId(steamAppId) {
  if (WIKIDATA_DEBUG) console.log(`${WIKIDATA_LOG_PREFIX} queryBySteamAppId called for: ${steamAppId}`);

  const query = `
    SELECT ?game ?gameLabel ${SPARQL_SELECT_FIELDS}
    WHERE {
      ?game wdt:${PROPERTIES.STEAM_APP_ID} "${steamAppId}" .
      ${SPARQL_OPTIONAL_CLAUSES}
    }
    GROUP BY ?game ?gameLabel
    LIMIT 1
  `;

  const result = await executeSparqlQuery(query);

  // Query failed (network/rate limit) - throw to signal transient failure
  if (result === null) {
    throw new Error('Wikidata query failed - will retry later');
  }

  // Query succeeded but no results - game genuinely not in Wikidata
  if (!result?.results?.bindings?.length) {
    console.log(`${WIKIDATA_LOG_PREFIX} No Wikidata match for Steam appid ${steamAppId}`);
    return createEmptyResult();
  }

  const gameResult = parseBindingToResult(result.results.bindings[0]);

  if (WIKIDATA_DEBUG) {
    console.log(`${WIKIDATA_LOG_PREFIX} Found ${steamAppId} -> ${gameResult.wikidataId}:`, gameResult.platforms);
  } else {
    const { nintendo, playstation, xbox } = gameResult.platforms;
    console.log(`${WIKIDATA_LOG_PREFIX} Found ${steamAppId} -> ${gameResult.wikidataId}: NS=${nintendo}, PS=${playstation}, XB=${xbox}`);
  }

  return gameResult;
}

/**
 * Batch query multiple Steam App IDs
 * @param {string[]} steamAppIds - Array of Steam App IDs
 * @returns {Promise<Map<string, WikidataResult>>}
 * @throws {Error} When query fails due to network/rate limit (caller should NOT cache)
 */
async function batchQueryBySteamAppIds(steamAppIds) {
  const results = new Map();
  const BATCH_SIZE = 20;

  for (let i = 0; i < steamAppIds.length; i += BATCH_SIZE) {
    const batch = steamAppIds.slice(i, i + BATCH_SIZE);
    const valuesClause = batch.map(id => `"${id}"`).join(' ');

    const query = `
      SELECT ?steamId ?game ?gameLabel ${SPARQL_SELECT_FIELDS}
      WHERE {
        VALUES ?steamId { ${valuesClause} }
        ?game wdt:${PROPERTIES.STEAM_APP_ID} ?steamId .
        ${SPARQL_OPTIONAL_CLAUSES}
      }
      GROUP BY ?steamId ?game ?gameLabel
    `;

    const result = await executeSparqlQuery(query);

    // Query failed - throw to signal transient failure
    if (result === null) {
      throw new Error('Wikidata batch query failed - will retry later');
    }

    if (result?.results?.bindings) {
      for (const binding of result.results.bindings) {
        const steamId = binding.steamId?.value;
        if (steamId) {
          results.set(steamId, parseBindingToResult(binding));
        }
      }
    }

    if (steamAppIds.length > BATCH_SIZE) {
      console.log(`${WIKIDATA_LOG_PREFIX} Batch progress: ${Math.min(i + BATCH_SIZE, steamAppIds.length)}/${steamAppIds.length}`);
    }
  }

  // Games not found in Wikidata get empty results (this is cached)
  for (const appId of steamAppIds) {
    if (!results.has(appId)) {
      results.set(appId, createEmptyResult());
    }
  }

  return results;
}

/**
 * Gets the store URL for a platform
 * @param {string} platform - 'nintendo', 'playstation', or 'xbox'
 * @param {Object} storeIds - Store IDs from Wikidata
 * @returns {string | null}
 */
function getStoreUrl(platform, storeIds) {
  const storeIdKey = PLATFORM_STORE_ID_MAP[platform];
  if (!storeIdKey) return null;
  return buildStoreUrl(platform, storeIds[storeIdKey]);
}

/**
 * Tests the Wikidata connection with a simple query
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function testConnection() {
  try {
    const result = await queryBySteamAppId('620');
    const message = result.found ? 'Wikidata connection successful' : 'Wikidata reachable (test game not found)';
    return { success: true, message };
  } catch (error) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

// Export for service worker
globalThis.XCPW_WikidataClient = {
  queryBySteamAppId,
  batchQueryBySteamAppIds,
  getStoreUrl,
  testConnection,
  STORE_URL_BUILDERS,
  PLATFORM_QIDS
};
