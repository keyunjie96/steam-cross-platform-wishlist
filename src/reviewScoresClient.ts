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
const DEBUG = false;

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
    .replace(/[^a-z0-9]/g, '')
    .trim();
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

/**
 * Converts OpenCritic tier string to our enum
 */
function parseTier(tierStr: string | null | undefined): ReviewScoreTier {
  if (!tierStr) return 'Unknown';
  const normalized = tierStr.toLowerCase();
  if (normalized === 'mighty') return 'Mighty';
  if (normalized === 'strong') return 'Strong';
  if (normalized === 'fair') return 'Fair';
  if (normalized === 'weak') return 'Weak';
  return 'Unknown';
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
  score: number;           // Outlet's score
  npScore?: number;        // Normalized score (0-100)
  scoreFormat?: {
    displayScore?: string; // Original score format (e.g., "8.5/10")
  };
  Outlet?: {
    id: number;
    name: string;
  };
}

/**
 * Outlet name mappings (OpenCritic uses specific names)
 */
const OUTLET_MAPPINGS: Record<string, 'ign' | 'gamespot' | 'metacritic'> = {
  'IGN': 'ign',
  'GameSpot': 'gamespot',
  'Metacritic': 'metacritic',
};

/**
 * Searches OpenCritic for a game by name
 */
async function searchOpenCritic(gameName: string): Promise<OpenCriticSearchItem[]> {
  try {
    const url = `${OPENCRITIC_API_BASE}/game/search?criteria=${encodeURIComponent(gameName)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (DEBUG) console.log(`${LOG_PREFIX} Search failed with status ${response.status}`); /* istanbul ignore if */
      return [];
    }

    const results = await response.json();
    if (!Array.isArray(results)) {
      return [];
    }

    return results as OpenCriticSearchItem[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (DEBUG) console.log(`${LOG_PREFIX} Search error:`, errorMessage); /* istanbul ignore if */
    return [];
  }
}

/**
 * Gets detailed game info from OpenCritic
 */
async function getGameDetails(gameId: number): Promise<OpenCriticGameDetails | null> {
  try {
    const url = `${OPENCRITIC_API_BASE}/game/${gameId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (DEBUG) console.log(`${LOG_PREFIX} Game details failed with status ${response.status}`); /* istanbul ignore if */
      return null;
    }

    const data = await response.json();
    return data as OpenCriticGameDetails;
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
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
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

    // Use normalized score (npScore) if available, otherwise use raw score
    const score = review.npScore ?? review.score;
    if (!score || score <= 0) continue;

    const outletScore: OutletScore = {
      outletName: review.Outlet.name,
      score: score,
    };

    // Include original score format if available
    if (review.scoreFormat?.displayScore) {
      outletScore.originalScore = review.scoreFormat.displayScore;
    }

    outletScores[outletKey] = outletScore;

    if (DEBUG) console.log(`${LOG_PREFIX} Found ${review.Outlet.name} score: ${score}`); /* istanbul ignore if */
  }

  return Object.keys(outletScores).length > 0 ? outletScores : undefined;
}

/**
 * Queries OpenCritic for review scores by game name.
 *
 * @param gameName - The game name to search for (from Steam)
 * @returns ReviewScoreSearchResult if found with confidence, null otherwise
 */
async function queryByGameName(gameName: string): Promise<ReviewScoreSearchResult | null> {
  if (DEBUG) console.log(`${LOG_PREFIX} Searching for: ${gameName}`); /* istanbul ignore if */

  await rateLimit();

  // Search for the game
  const searchResults = await searchOpenCritic(gameName);
  if (searchResults.length === 0) {
    if (DEBUG) console.log(`${LOG_PREFIX} No results for: ${gameName}`); /* istanbul ignore if */
    return null;
  }

  if (DEBUG) console.log(`${LOG_PREFIX} Got ${searchResults.length} results, first: ${searchResults[0].name}`); /* istanbul ignore if */

  // Calculate similarity scores and find best match
  const candidates = searchResults.map(item => ({
    item,
    similarity: calculateSimilarity(gameName, item.name)
  }));

  candidates.sort((a, b) => b.similarity - a.similarity);
  const best = candidates[0];

  if (best.similarity < 0.5) {
    if (DEBUG) console.log(`${LOG_PREFIX} Best match "${best.item.name}" too dissimilar (${(best.similarity * 100).toFixed(0)}%)`); /* istanbul ignore if */
    return null;
  }

  // Get detailed info for the best match
  await rateLimit();
  const details = await getGameDetails(best.item.id);
  if (!details || details.topCriticScore <= 0) {
    if (DEBUG) console.log(`${LOG_PREFIX} No score data for: ${best.item.name}`); /* istanbul ignore if */
    return null;
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
      score: details.topCriticScore,
      tier: parseTier(details.tier),
      numReviews: details.numTopCriticReviews || 0,
      percentRecommended: details.percentRecommended || 0,
      outletScores
    }
  };

  if (DEBUG) console.log(`${LOG_PREFIX} Best match: ${result.gameName} (${(best.similarity * 100).toFixed(0)}%), score=${result.data.score}, outlets: ${outletScores ? Object.keys(outletScores).join(', ') : 'none'}`); /* istanbul ignore if */
  return result;
}

/**
 * Batch queries OpenCritic for multiple games.
 * Note: OpenCritic API doesn't support batch queries, so this runs sequentially with rate limiting.
 */
async function batchQueryByGameNames(
  games: Array<{ appid: string; gameName: string }>
): Promise<Map<string, ReviewScoreSearchResult | null>> {
  const results = new Map<string, ReviewScoreSearchResult | null>();

  for (const { appid, gameName } of games) {
    try {
      const result = await queryByGameName(gameName);
      results.set(appid, result);
    } catch {
      results.set(appid, null);
    }
  }

  return results;
}

// Export for service worker
globalThis.SCPW_ReviewScoresClient = {
  queryByGameName,
  batchQueryByGameNames,
  normalizeGameName,
  calculateSimilarity,
  formatScore,
  getTierColor
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
  extractOutletScores
};
