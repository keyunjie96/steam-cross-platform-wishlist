/**
 * Steam Cross-Platform Wishlist - ProtonDB Client
 *
 * Fetches Steam Deck/Proton compatibility tiers from ProtonDB API.
 * Tiers: native, platinum, gold, silver, bronze, borked, pending
 */

const PROTONDB_DEBUG = false;
const PROTONDB_LOG_PREFIX = '[XCPW ProtonDB]';

const PROTONDB_API_URL = 'https://www.protondb.com/api/v1/reports/summaries';
const PROTONDB_REQUEST_DELAY_MS = 300; // Rate limit: be gentle with community API

let protondbRequestQueue = Promise.resolve();

/**
 * ProtonDB tier values in order of compatibility quality
 * @typedef {'native' | 'platinum' | 'gold' | 'silver' | 'bronze' | 'borked' | 'pending' | 'unknown'} ProtonDBTier
 */

/**
 * @typedef {Object} ProtonDBResult
 * @property {boolean} found - Whether the game was found in ProtonDB
 * @property {ProtonDBTier} tier - Compatibility tier
 * @property {number} confidence - Confidence level (0-1) based on report count
 * @property {string | null} bestReportedTier - Best tier from user reports
 */

const EMPTY_RESULT = {
  found: false,
  tier: 'unknown',
  confidence: 0,
  bestReportedTier: null
};

/**
 * Serializes requests through a queue to prevent concurrent bursts.
 * @returns {Promise<void>}
 */
async function rateLimit() {
  const previousRequest = protondbRequestQueue;
  let resolve;
  protondbRequestQueue = new Promise(r => { resolve = r; });

  await previousRequest;
  await new Promise(r => setTimeout(r, PROTONDB_REQUEST_DELAY_MS));
  resolve();
}

/**
 * Queries ProtonDB for Steam Deck/Proton compatibility
 * @param {string} steamAppId - Steam app ID
 * @returns {Promise<ProtonDBResult>}
 */
async function queryByAppId(steamAppId) {
  if (!steamAppId) {
    return { ...EMPTY_RESULT };
  }

  await rateLimit();

  const url = `${PROTONDB_API_URL}/${steamAppId}.json`;

  try {
    if (PROTONDB_DEBUG) {
      console.log(`${PROTONDB_LOG_PREFIX} Querying ${steamAppId}`);
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SteamCrossPlatformWishlist/1.0'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Game not in ProtonDB (no reports yet)
        console.log(`${PROTONDB_LOG_PREFIX} No data for ${steamAppId}`);
        return { ...EMPTY_RESULT, tier: 'pending' };
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // ProtonDB returns: { tier, confidence, score, total, trendingTier, bestReportedTier }
    const result = {
      found: true,
      tier: normalizeTier(data.tier),
      confidence: data.confidence || 0,
      bestReportedTier: data.bestReportedTier || null
    };

    console.log(`${PROTONDB_LOG_PREFIX} Found ${steamAppId}: tier=${result.tier}, confidence=${result.confidence}`);

    return result;
  } catch (error) {
    console.error(`${PROTONDB_LOG_PREFIX} Query failed for ${steamAppId}:`, error.message);
    return { ...EMPTY_RESULT };
  }
}

/**
 * Normalizes tier string to valid tier value
 * @param {string | undefined} tier
 * @returns {ProtonDBTier}
 */
function normalizeTier(tier) {
  const validTiers = ['native', 'platinum', 'gold', 'silver', 'bronze', 'borked', 'pending'];
  const normalized = tier?.toLowerCase();
  return validTiers.includes(normalized) ? normalized : 'unknown';
}

/**
 * Returns ProtonDB page URL for a game
 * @param {string} steamAppId
 * @returns {string}
 */
function getProtonDBUrl(steamAppId) {
  return `https://www.protondb.com/app/${steamAppId}`;
}

/**
 * Converts ProtonDB tier to status for display
 * @param {ProtonDBTier} tier
 * @returns {'available' | 'unavailable' | 'unknown'}
 */
function tierToStatus(tier) {
  switch (tier) {
    case 'native':
    case 'platinum':
    case 'gold':
      return 'available';
    case 'silver':
    case 'bronze':
      return 'available'; // Still playable, but with caveats
    case 'borked':
      return 'unavailable';
    case 'pending':
    case 'unknown':
    default:
      return 'unknown';
  }
}

// Export for service worker
const ProtonDBClient = {
  queryByAppId,
  getProtonDBUrl,
  tierToStatus,
  normalizeTier
};

if (typeof globalThis !== 'undefined') {
  globalThis.XCPW_ProtonDBClient = ProtonDBClient;
}
