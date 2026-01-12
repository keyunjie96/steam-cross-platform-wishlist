/**
 * Steam Cross-Platform Wishlist - Wikidata Client
 *
 * Queries Wikidata SPARQL endpoint for platform availability data.
 * No authentication required - works out of the box.
 * Only calls query.wikidata.org.
 */

const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
const WIKIDATA_LOG_PREFIX = '[XCPW Wikidata]';
const WIKIDATA_DEBUG = false; // Set to true for verbose debugging

// Rate limiting - Wikidata asks for reasonable usage
// Increased delay to avoid 429 errors
const REQUEST_DELAY_MS = 500; // 500ms between requests
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000; // 1 second initial backoff for 429
let lastRequestTime = 0;

// Wikidata Platform QIDs
const PLATFORM_QIDS = {
  // Nintendo
  SWITCH: 'Q19610114',

  // PlayStation
  PS4: 'Q5014725',
  PS5: 'Q63184502',

  // Xbox
  XBOX_ONE: 'Q13361286',
  XBOX_SERIES_X: 'Q64513817',
  XBOX_SERIES_S: 'Q98973368',

  // PC (for reference)
  WINDOWS: 'Q1406',
  MACOS: 'Q14116',
  LINUX: 'Q388',

  // Mobile
  IOS: 'Q48493',
  ANDROID: 'Q94'
};

// Wikidata Property IDs
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

  // Platform-specific store IDs (used to detect availability when P400 is incomplete)
  // Nintendo
  SWITCH_TITLE_ID: 'P11072',       // Nintendo Switch title ID
  ESHOP_EUROPE_ID: 'P12418',       // Nintendo eShop (Europe) ID
  ESHOP_US_ID: 'P8084',            // Nintendo eShop ID
  NINTENDO_LIFE_GAME_ID: 'P12735', // Nintendo Life game ID

  // PlayStation
  PS_STORE_EU: 'P5971',            // Europe PlayStation Store ID
  PS_STORE_JP: 'P5999',            // Japan PlayStation Store ID
  PS_STORE_NA: 'P5944',            // North America PlayStation Store ID
  PS_STORE_CONCEPT: 'P12332',      // PlayStation Store concept ID
  PUSH_SQUARE_ID: 'P12736',        // Push Square game ID

  // Xbox
  MS_STORE_ID: 'P5885',            // Microsoft Store product ID
  PURE_XBOX_ID: 'P12737',          // Pure Xbox game ID
  XBOX_360_STORE: 'P11789'         // Xbox Games Store ID (Xbox 360)
};

// Store URL constructors
// These build direct store page URLs from Wikidata external IDs
// Region-agnostic URLs - stores will redirect users to their local version
const STORE_URL_BUILDERS = {
  nintendo: (eshopId) => eshopId
    ? `https://www.nintendo.com/store/products/${eshopId}/`  // No region - auto-redirects
    : null,
  playstation: (psStoreId) => psStoreId
    ? `https://store.playstation.com/concept/${psStoreId}`   // No region - auto-redirects
    : null,
  xbox: (xboxId) => xboxId
    ? `https://www.xbox.com/games/store/-/${xboxId}`         // No region - auto-redirects
    : null,
  gog: (gogId) => gogId
    ? `https://www.gog.com/game/${gogId}`
    : null,
  epic: (epicId) => epicId
    ? `https://store.epicgames.com/p/${epicId}`              // No region
    : null,
  appStore: (appStoreId) => appStoreId
    ? `https://apps.apple.com/app/id${appStoreId}`           // No region - auto-redirects
    : null,
  playStore: (playStoreId) => playStoreId
    ? `https://play.google.com/store/apps/details?id=${playStoreId}`
    : null,
  itch: (itchId) => itchId
    ? `https://${itchId}.itch.io/`
    : null
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
 */
async function queryBySteamAppId(steamAppId) {
  if (WIKIDATA_DEBUG) console.log(`${WIKIDATA_LOG_PREFIX} queryBySteamAppId called for: ${steamAppId}`);

  // SPARQL query to get game data by Steam App ID
  // Uses both P400 (platforms) AND platform-specific store IDs to detect availability
  // This handles cases where P400 is incomplete but store IDs exist
  const query = `
    SELECT ?game ?gameLabel
           (GROUP_CONCAT(DISTINCT ?platformQID; separator=",") AS ?platforms)
           (SAMPLE(?eshopId) AS ?eshop)
           (SAMPLE(?psStoreId) AS ?psStore)
           (SAMPLE(?xboxId) AS ?xbox)
           (SAMPLE(?gogId) AS ?gog)
           (SAMPLE(?epicId) AS ?epic)
           (SAMPLE(?appStoreId) AS ?appStore)
           (SAMPLE(?playStoreId) AS ?playStore)
           (SAMPLE(?switchTitleId) AS ?switchTitle)
           (SAMPLE(?eshopEuId) AS ?eshopEu)
           (SAMPLE(?eshopUsId) AS ?eshopUs)
           (SAMPLE(?psStoreEuId) AS ?psStoreEu)
           (SAMPLE(?psStoreNaId) AS ?psStoreNa)
           (SAMPLE(?psStoreConceptId) AS ?psStoreConcept)
           (SAMPLE(?msStoreId) AS ?msStore)
           (SAMPLE(?pureXboxId) AS ?pureXbox)
    WHERE {
      ?game wdt:${PROPERTIES.STEAM_APP_ID} "${steamAppId}" .

      OPTIONAL {
        ?game wdt:${PROPERTIES.PLATFORM} ?platform .
        BIND(STRAFTER(STR(?platform), "entity/") AS ?platformQID)
      }

      # Primary store IDs
      OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_ID} ?eshopId . }
      OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_ID} ?psStoreId . }
      OPTIONAL { ?game wdt:${PROPERTIES.XBOX_ID} ?xboxId . }
      OPTIONAL { ?game wdt:${PROPERTIES.GOG_ID} ?gogId . }
      OPTIONAL { ?game wdt:${PROPERTIES.EPIC_ID} ?epicId . }
      OPTIONAL { ?game wdt:${PROPERTIES.APP_STORE_ID} ?appStoreId . }
      OPTIONAL { ?game wdt:${PROPERTIES.PLAY_STORE_ID} ?playStoreId . }

      # Nintendo platform-specific IDs (fallback detection)
      OPTIONAL { ?game wdt:${PROPERTIES.SWITCH_TITLE_ID} ?switchTitleId . }
      OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_EUROPE_ID} ?eshopEuId . }
      OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_US_ID} ?eshopUsId . }

      # PlayStation platform-specific IDs (fallback detection)
      OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_EU} ?psStoreEuId . }
      OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_NA} ?psStoreNaId . }
      OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_CONCEPT} ?psStoreConceptId . }

      # Xbox platform-specific IDs (fallback detection)
      OPTIONAL { ?game wdt:${PROPERTIES.MS_STORE_ID} ?msStoreId . }
      OPTIONAL { ?game wdt:${PROPERTIES.PURE_XBOX_ID} ?pureXboxId . }

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    GROUP BY ?game ?gameLabel
    LIMIT 1
  `;

  const result = await executeSparqlQuery(query);

  if (!result?.results?.bindings?.length) {
    console.log(`${WIKIDATA_LOG_PREFIX} No Wikidata match for Steam appid ${steamAppId}`);
    return {
      wikidataId: null,
      gameName: '',
      found: false,
      platforms: {
        nintendo: false,
        playstation: false,
        xbox: false
      },
      storeIds: {
        eshop: null,
        psStore: null,
        xbox: null,
        gog: null,
        epic: null,
        appStore: null,
        playStore: null
      }
    };
  }

  const binding = result.results.bindings[0];
  const platformQIDs = binding.platforms?.value?.split(',') || [];

  // Check platform availability from P400 platforms property
  const hasSwitchP400 = platformQIDs.includes(PLATFORM_QIDS.SWITCH);
  const hasPSP400 = platformQIDs.includes(PLATFORM_QIDS.PS4) ||
                    platformQIDs.includes(PLATFORM_QIDS.PS5);
  const hasXboxP400 = platformQIDs.includes(PLATFORM_QIDS.XBOX_ONE) ||
                      platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_X) ||
                      platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_S);

  // Check platform availability from platform-specific store IDs (fallback)
  // Note: Only use ExternalId type properties, not WikibaseItem references
  const hasSwitchStoreId = !!(
    binding.switchTitle?.value ||
    binding.eshopEu?.value ||
    binding.eshopUs?.value
    // Note: P8956 (eshop) is WikibaseItem type "compatible with", NOT an eShop ID - excluded
  );
  const hasPSStoreId = !!(
    binding.psStoreEu?.value ||
    binding.psStoreNa?.value ||
    binding.psStoreConcept?.value ||
    binding.psStore?.value
  );
  // Note: Pure Xbox IDs containing "xbox-for-pc" are PC-only releases, not console
  const pureXboxId = binding.pureXbox?.value;
  const isPureXboxConsole = pureXboxId && !pureXboxId.includes('xbox-for-pc') && !pureXboxId.includes('-for-pc');

  const hasXboxStoreId = !!(
    binding.msStore?.value ||
    isPureXboxConsole ||
    binding.xbox?.value
  );

  // Final availability: P400 OR platform-specific store IDs
  const hasSwitch = hasSwitchP400 || hasSwitchStoreId;
  const hasPS = hasPSP400 || hasPSStoreId;
  const hasXbox = hasXboxP400 || hasXboxStoreId;

  // Extract Wikidata QID from URI
  const wikidataId = binding.game?.value
    ? binding.game.value.split('/').pop()
    : null;

  const gameResult = {
    wikidataId,
    gameName: binding.gameLabel?.value || '',
    found: true,
    platforms: {
      nintendo: hasSwitch,
      playstation: hasPS,
      xbox: hasXbox
    },
    storeIds: {
      eshop: binding.eshopUs?.value || binding.eshopEu?.value || null, // P8084 (US) or P12418 (EU)
      psStore: binding.psStoreConcept?.value || binding.psStoreNa?.value || binding.psStoreEu?.value || binding.psStore?.value || null, // Prefer concept ID
      xbox: binding.msStore?.value || binding.xbox?.value || null, // P5885 (MS Store) preferred
      gog: binding.gog?.value || null,
      epic: binding.epic?.value || null,
      appStore: binding.appStore?.value || null,
      playStore: binding.playStore?.value || null
    }
  };

  if (WIKIDATA_DEBUG) {
    console.log(`${WIKIDATA_LOG_PREFIX} Found ${steamAppId} -> ${wikidataId}:`);
    console.log(`  P400: NS=${hasSwitchP400}, PS=${hasPSP400}, XB=${hasXboxP400}`);
    console.log(`  StoreIDs: NS=${hasSwitchStoreId}, PS=${hasPSStoreId}, XB=${hasXboxStoreId}`);
    console.log(`  Final: NS=${hasSwitch}, PS=${hasPS}, XB=${hasXbox}`);
  } else {
    console.log(`${WIKIDATA_LOG_PREFIX} Found ${steamAppId} -> ${wikidataId}: NS=${hasSwitch}, PS=${hasPS}, XB=${hasXbox}`);
  }

  return gameResult;
}

/**
 * Batch query multiple Steam App IDs
 * @param {string[]} steamAppIds - Array of Steam App IDs
 * @returns {Promise<Map<string, WikidataResult>>}
 */
async function batchQueryBySteamAppIds(steamAppIds) {
  const results = new Map();

  // Wikidata SPARQL doesn't handle large IN clauses well
  // Process in smaller batches
  const BATCH_SIZE = 20;

  for (let i = 0; i < steamAppIds.length; i += BATCH_SIZE) {
    const batch = steamAppIds.slice(i, i + BATCH_SIZE);

    // Build VALUES clause for batch query
    const valuesClause = batch.map(id => `"${id}"`).join(' ');

    // Uses both P400 (platforms) AND platform-specific store IDs to detect availability
    const query = `
      SELECT ?steamId ?game ?gameLabel
             (GROUP_CONCAT(DISTINCT ?platformQID; separator=",") AS ?platforms)
             (SAMPLE(?eshopId) AS ?eshop)
             (SAMPLE(?psStoreId) AS ?psStore)
             (SAMPLE(?xboxId) AS ?xbox)
             (SAMPLE(?gogId) AS ?gog)
             (SAMPLE(?epicId) AS ?epic)
             (SAMPLE(?switchTitleId) AS ?switchTitle)
             (SAMPLE(?eshopEuId) AS ?eshopEu)
             (SAMPLE(?eshopUsId) AS ?eshopUs)
             (SAMPLE(?psStoreEuId) AS ?psStoreEu)
             (SAMPLE(?psStoreNaId) AS ?psStoreNa)
             (SAMPLE(?psStoreConceptId) AS ?psStoreConcept)
             (SAMPLE(?msStoreId) AS ?msStore)
             (SAMPLE(?pureXboxId) AS ?pureXbox)
      WHERE {
        VALUES ?steamId { ${valuesClause} }
        ?game wdt:${PROPERTIES.STEAM_APP_ID} ?steamId .

        OPTIONAL {
          ?game wdt:${PROPERTIES.PLATFORM} ?platform .
          BIND(STRAFTER(STR(?platform), "entity/") AS ?platformQID)
        }

        # Primary store IDs
        OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_ID} ?eshopId . }
        OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_ID} ?psStoreId . }
        OPTIONAL { ?game wdt:${PROPERTIES.XBOX_ID} ?xboxId . }
        OPTIONAL { ?game wdt:${PROPERTIES.GOG_ID} ?gogId . }
        OPTIONAL { ?game wdt:${PROPERTIES.EPIC_ID} ?epicId . }

        # Nintendo platform-specific IDs (fallback detection)
        OPTIONAL { ?game wdt:${PROPERTIES.SWITCH_TITLE_ID} ?switchTitleId . }
        OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_EUROPE_ID} ?eshopEuId . }
        OPTIONAL { ?game wdt:${PROPERTIES.ESHOP_US_ID} ?eshopUsId . }

        # PlayStation platform-specific IDs (fallback detection)
        OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_EU} ?psStoreEuId . }
        OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_NA} ?psStoreNaId . }
        OPTIONAL { ?game wdt:${PROPERTIES.PS_STORE_CONCEPT} ?psStoreConceptId . }

        # Xbox platform-specific IDs (fallback detection)
        OPTIONAL { ?game wdt:${PROPERTIES.MS_STORE_ID} ?msStoreId . }
        OPTIONAL { ?game wdt:${PROPERTIES.PURE_XBOX_ID} ?pureXboxId . }

        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      GROUP BY ?steamId ?game ?gameLabel
    `;

    const result = await executeSparqlQuery(query);

    if (result?.results?.bindings) {
      for (const binding of result.results.bindings) {
        const steamId = binding.steamId?.value;
        if (!steamId) continue;

        const platformQIDs = binding.platforms?.value?.split(',') || [];

        // Check platform availability from P400 platforms property
        const hasSwitchP400 = platformQIDs.includes(PLATFORM_QIDS.SWITCH);
        const hasPSP400 = platformQIDs.includes(PLATFORM_QIDS.PS4) ||
                          platformQIDs.includes(PLATFORM_QIDS.PS5);
        const hasXboxP400 = platformQIDs.includes(PLATFORM_QIDS.XBOX_ONE) ||
                            platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_X) ||
                            platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_S);

        // Check platform availability from platform-specific store IDs (fallback)
        // Note: Only use ExternalId type properties, not WikibaseItem references
        const hasSwitchStoreId = !!(
          binding.switchTitle?.value ||
          binding.eshopEu?.value ||
          binding.eshopUs?.value
          // Note: P8956 (eshop) is WikibaseItem type "compatible with", NOT an eShop ID - excluded
        );
        const hasPSStoreId = !!(
          binding.psStoreEu?.value ||
          binding.psStoreNa?.value ||
          binding.psStoreConcept?.value ||
          binding.psStore?.value
        );
        // Note: Pure Xbox IDs containing "xbox-for-pc" are PC-only releases, not console
        const pureXboxId = binding.pureXbox?.value;
        const isPureXboxConsole = pureXboxId && !pureXboxId.includes('xbox-for-pc') && !pureXboxId.includes('-for-pc');

        const hasXboxStoreId = !!(
          binding.msStore?.value ||
          isPureXboxConsole ||
          binding.xbox?.value
        );

        // Final availability: P400 OR platform-specific store IDs
        const hasSwitch = hasSwitchP400 || hasSwitchStoreId;
        const hasPS = hasPSP400 || hasPSStoreId;
        const hasXbox = hasXboxP400 || hasXboxStoreId;

        const wikidataId = binding.game?.value
          ? binding.game.value.split('/').pop()
          : null;

        results.set(steamId, {
          wikidataId,
          gameName: binding.gameLabel?.value || '',
          found: true,
          platforms: {
            nintendo: hasSwitch,
            playstation: hasPS,
            xbox: hasXbox
          },
          storeIds: {
            eshop: binding.eshopUs?.value || binding.eshopEu?.value || null, // P8084 (US) or P12418 (EU)
            psStore: binding.psStoreConcept?.value || binding.psStoreNa?.value || binding.psStoreEu?.value || binding.psStore?.value || null, // Prefer concept ID
            xbox: binding.msStore?.value || binding.xbox?.value || null, // P5885 (MS Store) preferred
            gog: binding.gog?.value || null,
            epic: binding.epic?.value || null,
            appStore: null,
            playStore: null
          }
        });
      }
    }

    // Log progress
    if (steamAppIds.length > BATCH_SIZE) {
      console.log(`${WIKIDATA_LOG_PREFIX} Batch progress: ${Math.min(i + BATCH_SIZE, steamAppIds.length)}/${steamAppIds.length}`);
    }
  }

  // Mark unfound games
  for (const appId of steamAppIds) {
    if (!results.has(appId)) {
      results.set(appId, {
        wikidataId: null,
        gameName: '',
        found: false,
        platforms: { nintendo: false, playstation: false, xbox: false },
        storeIds: { eshop: null, psStore: null, xbox: null, gog: null, epic: null, appStore: null, playStore: null }
      });
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
  switch (platform) {
    case 'nintendo':
      return STORE_URL_BUILDERS.nintendo(storeIds.eshop);
    case 'playstation':
      return STORE_URL_BUILDERS.playstation(storeIds.psStore);
    case 'xbox':
      return STORE_URL_BUILDERS.xbox(storeIds.xbox);
    default:
      return null;
  }
}

/**
 * Tests the Wikidata connection with a simple query
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function testConnection() {
  try {
    // Query for a well-known game (Portal 2 - Steam App ID 620)
    const result = await queryBySteamAppId('620');

    if (result.found) {
      return { success: true, message: 'Wikidata connection successful' };
    }
    return { success: true, message: 'Wikidata reachable (test game not found)' };
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
