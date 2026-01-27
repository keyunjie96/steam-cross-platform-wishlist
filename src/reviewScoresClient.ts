/**
 * Steam Cross-Platform Wishlist - Review Scores Client
 *
 * Queries OpenCritic for game review scores.
 * OpenCritic aggregates reviews from multiple sources and provides a unified score.
 *
 * API endpoints:
 * - Search: GET https://api.opencritic.com/api/game/search?criteria=<name>
 * - Game details: GET https://api.opencritic.com/api/game/<id>
 */

import type { ReviewScoreData, ReviewScoreTier, ReviewScoreSearchResult, OutletScore } from './types';

const OPENCRITIC_API_BASE = 'https://api.opencritic.com/api';
const LOG_PREFIX = '[SCPW ReviewScores]';
const DEBUG = true;

const REQUEST_DELAY_MS = 300;

let requestQueue = Promise.resolve();

/**
 * Serializes requests through a queue to prevent concurrent bursts.
 */
async function rateLimit(): Promise<void> {
  const myTurn = requestQueue.then(() => new Promise<void>(resolve => setTimeout(resolve, REQUEST_DELAY_MS)));
  requestQueue = myTurn.catch(() => { /* ignore */ });
  await myTurn;
}

/**
 * Normalizes a game name for fuzzy matching
 */
function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Creates a URL slug from a game name for OpenCritic URLs.
 * Example: "Elden Ring" -> "elden-ring"
 */
function slugifyGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
}

/**
 * Constructs the full OpenCritic game page URL.
 * Example: buildOpenCriticUrl(14607, "Elden Ring") -> "https://opencritic.com/game/14607/elden-ring"
 */
function buildOpenCriticUrl(gameId: number, gameName: string): string {
  const slug = slugifyGameName(gameName);
  return `https://opencritic.com/game/${gameId}/${slug}`;
}

/**
 * Calculates similarity between two strings (0-1)
 * Uses Jaccard similarity on character n-grams
 */
function calculateSimilarity(a: string, b: string): number {
  const aNorm = normalizeGameName(a);
  const bNorm = normalizeGameName(b);

  if (aNorm === bNorm) return 1;
  if (!aNorm || !bNorm) return 0;

  // Simple containment check
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    const shorter = aNorm.length < bNorm.length ? aNorm : bNorm;
    const longer = aNorm.length >= bNorm.length ? aNorm : bNorm;
    return shorter.length / longer.length;
  }

  // Jaccard similarity on 2-grams
  const ngramSize = 2;
  const getNgrams = (s: string): Set<string> => {
    const ngrams = new Set<string>();
    for (let i = 0; i <= s.length - ngramSize; i++) {
      ngrams.add(s.slice(i, i + ngramSize));
    }
    return ngrams;
  };

  const aGrams = getNgrams(aNorm);
  const bGrams = getNgrams(bNorm);

  if (aGrams.size === 0 || bGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection++;
  }

  const union = aGrams.size + bGrams.size - intersection;
  return intersection / union;
}

/**
 * Formats a score for display (e.g., "85" or "92")
 */
function formatScore(score: number): string {
  if (!score || score <= 0) return '';
  return Math.round(score).toString();
}

/**
 * Gets the display color for a review tier
 */
function getTierColor(tier: ReviewScoreTier): string {
  switch (tier) {
    case 'Mighty':
      return '#66cc33'; // Green
    case 'Strong':
      return '#99cc33'; // Yellow-green
    case 'Fair':
      return '#ffcc33'; // Yellow
    case 'Weak':
      return '#ff6633'; // Orange-red
    default:
      return '#888888'; // Gray for unknown
  }
}

/** Maps normalized tier strings to ReviewScoreTier values */
const TIER_MAP: Record<string, ReviewScoreTier> = {
  mighty: 'Mighty',
  strong: 'Strong',
  fair: 'Fair',
  weak: 'Weak'
};

/**
 * Converts OpenCritic tier string to our enum
 */
function parseTier(tierStr: string | null | undefined): ReviewScoreTier {
  if (!tierStr) return 'Unknown';
  return TIER_MAP[tierStr.toLowerCase()] || 'Unknown';
}

/**
 * OpenCritic search result item
 */
interface OpenCriticSearchItem {
  id: number;
  name: string;
  dist?: number; // Distance score from search (lower is better)
}

/**
 * OpenCritic game details
 */
interface OpenCriticGameDetails {
  id: number;
  name: string;
  topCriticScore: number;
  tier: string;
  numTopCriticReviews: number;
  percentRecommended?: number;
}

/**
 * OpenCritic review item (from /api/review/game/<id>)
 */
interface OpenCriticReviewItem {
  id: number;
  score: number;           // Outlet's score (normalized to 0-100)
  npScore?: number;        // OpenCritic normalized score for ranking
  externalUrl?: string;    // Direct link to the review
  ScoreFormat?: {
    base?: number;         // Scale base (e.g., 10 for 0-10 scale, 100 for percentage)
    shortName?: string;    // Format description (e.g., "x.x / 10.0")
  };
  Outlet?: {
    id: number;
    name: string;
  };
}

/**
 * Outlet name mappings (OpenCritic uses specific names)
 */
const OUTLET_MAPPINGS: Record<string, 'ign' | 'gamespot'> = {
  'IGN': 'ign',
  'GameSpot': 'gamespot',
};

/**
 * Search result with error tracking for debugging
 */
interface SearchResultWithError {
  results: OpenCriticSearchItem[];
  error?: string;
}

/**
 * Searches OpenCritic for a game by name
 */
async function searchOpenCritic(gameName: string): Promise<SearchResultWithError> {
  try {
    const url = `${OPENCRITIC_API_BASE}/game/search?criteria=${encodeURIComponent(gameName)}`;
    if (DEBUG) console.log(`${LOG_PREFIX} Fetching: ${url}`); /* istanbul ignore if */
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      }
    });

    if (!response.ok) {
      let errorBody = '';
      try { errorBody = await response.text(); } catch { /* ignore */ }
      if (DEBUG) console.log(`${LOG_PREFIX} Search failed: ${response.status} - ${errorBody}`); /* istanbul ignore if */
      return { results: [], error: `HTTP ${response.status}: ${errorBody}` };
    }

    const results = await response.json();
    if (Array.isArray(results) && results.length > 0) {
      return { results: results as OpenCriticSearchItem[] };
    }
    return { results: [] };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (DEBUG) console.log(`${LOG_PREFIX} Search error:`, errorMessage); /* istanbul ignore if */
    return { results: [], error: errorMessage };
  }
}

/**
 * Gets detailed game info from OpenCritic API
 */
async function getGameDetails(gameId: number): Promise<OpenCriticGameDetails | null> {
  try {
    const url = `${OPENCRITIC_API_BASE}/game/${gameId}`;
    if (DEBUG) console.log(`${LOG_PREFIX} Fetching details: ${url}`); /* istanbul ignore if */
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
      }
    });

    if (!response.ok) {
      if (DEBUG) console.log(`${LOG_PREFIX} Game details failed with status ${response.status}`); /* istanbul ignore if */
      return null;
    }

    const data = await response.json();
    if (data && data.topCriticScore !== undefined) {
      return data as OpenCriticGameDetails;
    }
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (DEBUG) console.log(`${LOG_PREFIX} Game details error:`, errorMessage); /* istanbul ignore if */
    return null;
  }
}

/**
 * Gets individual outlet reviews from OpenCritic
 */
async function getGameReviews(gameId: number): Promise<OpenCriticReviewItem[]> {
  try {
    const url = `${OPENCRITIC_API_BASE}/review/game/${gameId}`;
    if (DEBUG) console.log(`${LOG_PREFIX} Fetching reviews: ${url}`); /* istanbul ignore if */
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
      }
    });

    if (!response.ok) {
      if (DEBUG) console.log(`${LOG_PREFIX} Game reviews failed with status ${response.status}`); /* istanbul ignore if */
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    return data as OpenCriticReviewItem[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (DEBUG) console.log(`${LOG_PREFIX} Game reviews error:`, errorMessage); /* istanbul ignore if */
    return [];
  }
}

/**
 * Extracts individual outlet scores from OpenCritic reviews
 */
function extractOutletScores(reviews: OpenCriticReviewItem[]): ReviewScoreData['outletScores'] {
  const outletScores: ReviewScoreData['outletScores'] = {};

  for (const review of reviews) {
    if (!review.Outlet?.name) continue;

    const outletKey = OUTLET_MAPPINGS[review.Outlet.name];
    if (!outletKey) continue;

    // Skip if we already have a score for this outlet (take first/most recent)
    if (outletScores[outletKey]) continue;

    // Use the raw score (already normalized to 0-100 by OpenCritic)
    const score = review.score;
    if (!score || score <= 0) continue;

    const outletScore: OutletScore = {
      outletName: review.Outlet.name,
      score: score,
    };

    // Include scale base if available (e.g., 10 for IGN's 0-10 scale)
    if (review.ScoreFormat?.base) {
      outletScore.scaleBase = review.ScoreFormat.base;
    }

    // Include review URL if available
    if (review.externalUrl) {
      outletScore.reviewUrl = review.externalUrl;
    }

    outletScores[outletKey] = outletScore;

    if (DEBUG) console.log(`${LOG_PREFIX} Found ${review.Outlet.name} score: ${score}`); /* istanbul ignore if */
  }

  return Object.keys(outletScores).length > 0 ? outletScores : undefined;
}

/**
 * Query result with optional failure reason for debugging
 */
interface QueryResultWithReason {
  result: ReviewScoreSearchResult | null;
  failureReason?: string;
}

/**
 * Queries OpenCritic using a known OpenCritic ID (from Wikidata).
 * This bypasses the search endpoint which has Origin restrictions.
 */
async function queryByOpenCriticId(openCriticId: number, gameName: string): Promise<QueryResultWithReason> {
  if (DEBUG) console.log(`${LOG_PREFIX} Direct query with OpenCritic ID ${openCriticId} for: ${gameName}`); /* istanbul ignore if */

  await rateLimit();
  const details = await getGameDetails(openCriticId);
  if (!details) {
    if (DEBUG) console.log(`${LOG_PREFIX} Failed to get details for ID: ${openCriticId}`); /* istanbul ignore if */
    return { result: null, failureReason: `details_fetch_failed for id ${openCriticId}` };
  }

  if (details.topCriticScore <= 0) {
    if (DEBUG) console.log(`${LOG_PREFIX} No score data for ID: ${openCriticId}`); /* istanbul ignore if */
    return { result: null, failureReason: `no_score_data: topCriticScore=${details.topCriticScore}` };
  }

  // Get individual outlet reviews
  await rateLimit();
  const reviews = await getGameReviews(openCriticId);
  const outletScores = extractOutletScores(reviews);

  const result: ReviewScoreSearchResult = {
    openCriticId: details.id,
    gameName: details.name,
    similarity: 1.0, // Direct ID match = perfect similarity
    data: {
      openCriticId: details.id,
      openCriticUrl: buildOpenCriticUrl(details.id, details.name),
      score: details.topCriticScore,
      tier: parseTier(details.tier),
      numReviews: details.numTopCriticReviews || 0,
      percentRecommended: details.percentRecommended || 0,
      outletScores
    }
  };

  if (DEBUG) console.log(`${LOG_PREFIX} Direct query success: ${result.gameName}, score=${result.data.score}, url=${result.data.openCriticUrl}`); /* istanbul ignore if */
  return { result };
}

/**
 * Queries OpenCritic for review scores by game name (search-based).
 * Note: The search endpoint requires specific Origin headers and may fail from extensions.
 *
 * @param gameName - The game name to search for (from Steam)
 * @returns QueryResultWithReason containing result and optional failure reason
 */
async function queryByGameNameWithReason(gameName: string): Promise<QueryResultWithReason> {
  if (DEBUG) console.log(`${LOG_PREFIX} Searching for: ${gameName}`); /* istanbul ignore if */

  await rateLimit();

  // Search for the game
  const searchResponse = await searchOpenCritic(gameName);
  if (searchResponse.error) {
    if (DEBUG) console.log(`${LOG_PREFIX} Search error for ${gameName}: ${searchResponse.error}`); /* istanbul ignore if */
    return { result: null, failureReason: `search_error: ${searchResponse.error}` };
  }

  if (searchResponse.results.length === 0) {
    if (DEBUG) console.log(`${LOG_PREFIX} No results for: ${gameName}`); /* istanbul ignore if */
    return { result: null, failureReason: 'no_search_results' };
  }

  if (DEBUG) console.log(`${LOG_PREFIX} Got ${searchResponse.results.length} results, first: ${searchResponse.results[0].name}`); /* istanbul ignore if */

  // Calculate similarity scores and find best match
  const candidates = searchResponse.results.map(item => ({
    item,
    similarity: calculateSimilarity(gameName, item.name)
  }));

  candidates.sort((a, b) => b.similarity - a.similarity);
  const best = candidates[0];

  if (best.similarity < 0.5) {
    if (DEBUG) console.log(`${LOG_PREFIX} Best match "${best.item.name}" too dissimilar (${(best.similarity * 100).toFixed(0)}%)`); /* istanbul ignore if */
    return { result: null, failureReason: `similarity_too_low: ${(best.similarity * 100).toFixed(0)}% for "${best.item.name}"` };
  }

  // Get detailed info for the best match
  await rateLimit();
  const details = await getGameDetails(best.item.id);
  if (!details) {
    if (DEBUG) console.log(`${LOG_PREFIX} Failed to get details for: ${best.item.name}`); /* istanbul ignore if */
    return { result: null, failureReason: `details_fetch_failed for id ${best.item.id}` };
  }

  if (details.topCriticScore <= 0) {
    if (DEBUG) console.log(`${LOG_PREFIX} No score data for: ${best.item.name}`); /* istanbul ignore if */
    return { result: null, failureReason: `no_score_data: topCriticScore=${details.topCriticScore}` };
  }

  // Get individual outlet reviews
  await rateLimit();
  const reviews = await getGameReviews(best.item.id);
  const outletScores = extractOutletScores(reviews);

  const result: ReviewScoreSearchResult = {
    openCriticId: details.id,
    gameName: details.name,
    similarity: best.similarity,
    data: {
      openCriticId: details.id,
      openCriticUrl: buildOpenCriticUrl(details.id, details.name),
      score: details.topCriticScore,
      tier: parseTier(details.tier),
      numReviews: details.numTopCriticReviews || 0,
      percentRecommended: details.percentRecommended || 0,
      outletScores
    }
  };

  if (DEBUG) console.log(`${LOG_PREFIX} Best match: ${result.gameName} (${(best.similarity * 100).toFixed(0)}%), score=${result.data.score}, url=${result.data.openCriticUrl}, outlets: ${outletScores ? Object.keys(outletScores).join(', ') : 'none'}`); /* istanbul ignore if */
  return { result };
}

/**
 * Queries OpenCritic for review scores by game name.
 *
 * @param gameName - The game name to search for (from Steam)
 * @returns ReviewScoreSearchResult if found with confidence, null otherwise
 */
async function queryByGameName(gameName: string): Promise<ReviewScoreSearchResult | null> {
  const { result } = await queryByGameNameWithReason(gameName);
  return result;
}

/**
 * Batch result with failure reasons for debugging
 */
interface BatchQueryResult {
  results: Map<string, ReviewScoreSearchResult | null>;
  failureReasons: Record<string, string>;
}

/**
 * Batch queries OpenCritic for multiple games.
 * When openCriticId is provided (from Wikidata), uses direct API call.
 * Otherwise falls back to search (which may fail due to Origin restrictions).
 */
async function batchQueryByGameNames(
  games: Array<{ appid: string; gameName: string; openCriticId?: string | null }>
): Promise<BatchQueryResult> {
  const results = new Map<string, ReviewScoreSearchResult | null>();
  const failureReasons: Record<string, string> = {};

  for (const { appid, gameName, openCriticId } of games) {
    try {
      let queryResult: QueryResultWithReason;

      // If we have an OpenCritic ID from Wikidata, use direct API call (bypasses search)
      if (openCriticId) {
        const numericId = parseInt(openCriticId, 10);
        if (!isNaN(numericId) && numericId > 0) {
          if (DEBUG) console.log(`${LOG_PREFIX} Using direct ID ${numericId} for ${gameName}`); /* istanbul ignore if */
          queryResult = await queryByOpenCriticId(numericId, gameName);
        } else {
          queryResult = await queryByGameNameWithReason(gameName);
        }
      } else {
        // No OpenCritic ID - try search (will likely fail with HTTP 400)
        queryResult = await queryByGameNameWithReason(gameName);
      }

      const { result, failureReason } = queryResult;
      results.set(appid, result);
      if (failureReason) {
        failureReasons[appid] = failureReason;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.set(appid, null);
      failureReasons[appid] = `exception: ${errorMessage}`;
    }
  }

  return { results, failureReasons };
}

// Export for service worker
globalThis.SCPW_ReviewScoresClient = {
  queryByGameName,
  batchQueryByGameNames,
  normalizeGameName,
  calculateSimilarity,
  formatScore,
  getTierColor,
  slugifyGameName,
  buildOpenCriticUrl
};

// Also export for module imports in tests
export {
  queryByGameName,
  batchQueryByGameNames,
  normalizeGameName,
  calculateSimilarity,
  formatScore,
  getTierColor,
  parseTier,
  getGameReviews,
  extractOutletScores,
  slugifyGameName,
  buildOpenCriticUrl
};
