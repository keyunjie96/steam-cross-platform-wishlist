/**
 * Steam Cross-Platform Wishlist - Review Scores Client
 *
 * Queries OpenCritic API for game review scores.
 * OpenCritic was chosen because:
 * - Public API (no auth required)
 * - Aggregated scores from multiple outlets
 * - Less restrictive than Metacritic
 */

import type { ReviewScore, ReviewScoreCacheEntry } from './types';

const OPENCRITIC_SEARCH_URL = 'https://api.opencritic.com/api/game/search';
const OPENCRITIC_GAME_URL = 'https://api.opencritic.com/api/game';
const OPENCRITIC_SITE_URL = 'https://opencritic.com/game';
const REVIEW_SCORES_LOG_PREFIX = '[XCPW ReviewScores]';
const REVIEW_SCORES_DEBUG = false;

const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const CACHE_KEY_PREFIX = 'xcpw_review_';
const DEFAULT_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

let requestQueue = Promise.resolve();

interface OpenCriticSearchResult {
  id: number;
  name: string;
  dist?: number; // Distance/fuzzy match score
}

interface OpenCriticGameDetails {
  id: number;
  name: string;
  topCriticScore: number; // -1 if no score yet
  tier?: string; // 'Mighty', 'Strong', 'Fair', 'Weak'
  numReviews?: number;
  numTopCriticReviews?: number;
}

/**
 * Serializes requests through a queue to prevent concurrent bursts.
 */
async function rateLimit(): Promise<void> {
  const myTurn = requestQueue.then(() => new Promise<void>(resolve => setTimeout(resolve, REQUEST_DELAY_MS)));
  requestQueue = myTurn.catch(() => { /* ignore */ });
  await myTurn;
}

/**
 * Normalizes a game name for comparison.
 * Removes special characters, converts to lowercase.
 */
function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

/**
 * Calculates similarity between two strings (simple Levenshtein-based).
 * Returns a value between 0 (completely different) and 1 (identical).
 */
function calculateSimilarity(a: string, b: string): number {
  const normalizedA = normalizeGameName(a);
  const normalizedB = normalizeGameName(b);

  if (normalizedA === normalizedB) return 1;

  const longer = normalizedA.length > normalizedB.length ? normalizedA : normalizedB;
  const shorter = normalizedA.length > normalizedB.length ? normalizedB : normalizedA;

  if (longer.length === 0) return 1;

  // Simple contains check for partial matches
  if (longer.includes(shorter) || shorter.includes(longer)) {
    return 0.8;
  }

  // Word overlap check
  const wordsA = new Set(normalizedA.split(' '));
  const wordsB = new Set(normalizedB.split(' '));
  const intersection = [...wordsA].filter(x => wordsB.has(x));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.length / union.size;
}

/**
 * Fetches data from OpenCritic with retry logic.
 */
async function fetchOpenCritic<T>(url: string, retryCount = 0): Promise<T | null> {
  await rateLimit();

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SteamCrossPlatformWishlist/0.5.0 (Chrome Extension)'
      }
    });

    // Handle rate limiting with exponential backoff
    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return fetchOpenCritic<T>(url, retryCount + 1);
      }
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return await response.json() as T;
  } catch {
    return null;
  }
}

/**
 * Searches OpenCritic for a game by name.
 */
async function searchGame(gameName: string): Promise<OpenCriticSearchResult | null> {
  const url = `${OPENCRITIC_SEARCH_URL}?criteria=${encodeURIComponent(gameName)}`;

  if (REVIEW_SCORES_DEBUG) {
    console.log(`${REVIEW_SCORES_LOG_PREFIX} Searching for: ${gameName}`);
  }

  const results = await fetchOpenCritic<OpenCriticSearchResult[]>(url);

  if (!results || results.length === 0) {
    if (REVIEW_SCORES_DEBUG) {
      console.log(`${REVIEW_SCORES_LOG_PREFIX} No results for: ${gameName}`);
    }
    return null;
  }

  // Find best match based on name similarity
  let bestMatch: OpenCriticSearchResult | null = null;
  let bestScore = 0;

  for (const result of results) {
    const similarity = calculateSimilarity(gameName, result.name);
    if (similarity > bestScore && similarity >= 0.5) {
      bestScore = similarity;
      bestMatch = result;
    }
  }

  if (REVIEW_SCORES_DEBUG && bestMatch) {
    console.log(`${REVIEW_SCORES_LOG_PREFIX} Best match for "${gameName}": "${bestMatch.name}" (similarity: ${bestScore.toFixed(2)})`);
  }

  return bestMatch;
}

/**
 * Gets detailed game info from OpenCritic.
 */
async function getGameDetails(gameId: number): Promise<OpenCriticGameDetails | null> {
  const url = `${OPENCRITIC_GAME_URL}/${gameId}`;
  return fetchOpenCritic<OpenCriticGameDetails>(url);
}

/**
 * Creates a URL-friendly slug from a game name.
 */
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Queries OpenCritic for a game's review score.
 * Returns null if game not found or no score available.
 */
async function queryReviewScore(gameName: string): Promise<ReviewScore | null> {
  if (REVIEW_SCORES_DEBUG) {
    console.log(`${REVIEW_SCORES_LOG_PREFIX} queryReviewScore called for: ${gameName}`);
  }

  // Search for the game
  const searchResult = await searchGame(gameName);
  if (!searchResult) {
    return null;
  }

  // Get detailed game info
  const details = await getGameDetails(searchResult.id);
  if (!details) {
    return null;
  }

  // Check if score is available (-1 means no score yet)
  if (details.topCriticScore < 0) {
    if (REVIEW_SCORES_DEBUG) {
      console.log(`${REVIEW_SCORES_LOG_PREFIX} No score available for: ${gameName}`);
    }
    return null;
  }

  const slug = createSlug(details.name);
  const reviewScore: ReviewScore = {
    source: 'opencritic',
    score: Math.round(details.topCriticScore),
    tier: details.tier,
    url: `${OPENCRITIC_SITE_URL}/${details.id}/${slug}`,
    criticCount: details.numTopCriticReviews || details.numReviews
  };

  console.log(`${REVIEW_SCORES_LOG_PREFIX} Found score for "${gameName}": ${reviewScore.score} (${reviewScore.tier || 'No tier'})`);

  return reviewScore;
}

/**
 * Gets the cache key for review scores.
 */
function getReviewCacheKey(appid: string): string {
  return `${CACHE_KEY_PREFIX}${appid}`;
}

/**
 * Checks if a review score cache entry is still valid.
 */
function isReviewCacheValid(entry: ReviewScoreCacheEntry | null | undefined): boolean {
  if (!entry?.resolvedAt || !entry?.ttlDays) {
    return false;
  }
  const expiresAt = entry.resolvedAt + entry.ttlDays * MS_PER_DAY;
  return Date.now() < expiresAt;
}

/**
 * Gets review score from cache.
 */
async function getFromReviewCache(appid: string): Promise<ReviewScoreCacheEntry | null> {
  const key = getReviewCacheKey(appid);
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as ReviewScoreCacheEntry | undefined;

  if (entry && isReviewCacheValid(entry)) {
    return entry;
  }

  return null;
}

/**
 * Saves review score to cache.
 */
async function saveToReviewCache(entry: ReviewScoreCacheEntry): Promise<void> {
  const key = getReviewCacheKey(entry.appid);
  await chrome.storage.local.set({ [key]: entry });
}

/**
 * Creates a cache entry for a review score result.
 */
function createReviewCacheEntry(appid: string, gameName: string, score: ReviewScore | null): ReviewScoreCacheEntry {
  return {
    appid,
    gameName,
    score,
    resolvedAt: Date.now(),
    ttlDays: DEFAULT_TTL_DAYS
  };
}

/**
 * Resolves review score for a game, using cache when available.
 */
async function resolveReviewScore(appid: string, gameName: string): Promise<{ entry: ReviewScoreCacheEntry; fromCache: boolean }> {
  // Check cache first
  const cached = await getFromReviewCache(appid);
  if (cached) {
    if (REVIEW_SCORES_DEBUG) {
      console.log(`${REVIEW_SCORES_LOG_PREFIX} Cache hit for appid ${appid}`);
    }
    return { entry: cached, fromCache: true };
  }

  // Query OpenCritic
  try {
    const score = await queryReviewScore(gameName);
    const entry = createReviewCacheEntry(appid, gameName, score);
    await saveToReviewCache(entry);
    return { entry, fromCache: false };
  } catch (error) {
    // On error, don't cache - allow retry later
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`${REVIEW_SCORES_LOG_PREFIX} Query failed for ${appid}:`, errorMessage);
    const entry = createReviewCacheEntry(appid, gameName, null);
    return { entry, fromCache: false };
  }
}

/**
 * Batch resolves review scores for multiple games.
 */
async function batchResolveReviewScores(games: Array<{ appid: string; gameName: string }>): Promise<Map<string, { entry: ReviewScoreCacheEntry; fromCache: boolean }>> {
  const results = new Map<string, { entry: ReviewScoreCacheEntry; fromCache: boolean }>();

  // Check cache first for all games
  const uncached: Array<{ appid: string; gameName: string }> = [];
  for (const { appid, gameName } of games) {
    const cached = await getFromReviewCache(appid);
    if (cached) {
      results.set(appid, { entry: cached, fromCache: true });
    } else {
      uncached.push({ appid, gameName });
    }
  }

  if (uncached.length === 0) {
    console.log(`${REVIEW_SCORES_LOG_PREFIX} All ${games.length} games found in cache`);
    return results;
  }

  console.log(`${REVIEW_SCORES_LOG_PREFIX} Resolving ${uncached.length} review scores (${games.length - uncached.length} cached)`);

  // Resolve uncached games sequentially to respect rate limits
  for (const { appid, gameName } of uncached) {
    const { entry, fromCache } = await resolveReviewScore(appid, gameName);
    results.set(appid, { entry, fromCache });
  }

  return results;
}

/**
 * Clears review score cache.
 */
async function clearReviewCache(): Promise<void> {
  const allData = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(allData).filter(key => key.startsWith(CACHE_KEY_PREFIX));
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}

/**
 * Gets review score cache statistics.
 */
async function getReviewCacheStats(): Promise<{ count: number; oldestEntry: number | null }> {
  const allData = await chrome.storage.local.get(null);
  const cacheEntries = Object.entries(allData)
    .filter(([key]) => key.startsWith(CACHE_KEY_PREFIX))
    .map(([, entry]) => entry as ReviewScoreCacheEntry);

  const timestamps = cacheEntries
    .map(entry => entry.resolvedAt)
    .filter(Boolean);

  return {
    count: cacheEntries.length,
    oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null
  };
}

// Export for service worker
globalThis.XCPW_ReviewScores = {
  resolveReviewScore,
  batchResolveReviewScores,
  queryReviewScore,
  getFromReviewCache,
  saveToReviewCache,
  clearReviewCache,
  getReviewCacheStats,
  isReviewCacheValid,
  calculateSimilarity,
  normalizeGameName,
  CACHE_KEY_PREFIX
};

// Declare global type
declare global {
  // eslint-disable-next-line no-var
  var XCPW_ReviewScores: {
    resolveReviewScore: typeof resolveReviewScore;
    batchResolveReviewScores: typeof batchResolveReviewScores;
    queryReviewScore: typeof queryReviewScore;
    getFromReviewCache: typeof getFromReviewCache;
    saveToReviewCache: typeof saveToReviewCache;
    clearReviewCache: typeof clearReviewCache;
    getReviewCacheStats: typeof getReviewCacheStats;
    isReviewCacheValid: typeof isReviewCacheValid;
    calculateSimilarity: typeof calculateSimilarity;
    normalizeGameName: typeof normalizeGameName;
    CACHE_KEY_PREFIX: string;
  };
}

// Also export for module imports in tests
export {
  resolveReviewScore,
  batchResolveReviewScores,
  queryReviewScore,
  getFromReviewCache,
  saveToReviewCache,
  clearReviewCache,
  getReviewCacheStats,
  isReviewCacheValid,
  calculateSimilarity,
  normalizeGameName,
  createReviewCacheEntry,
  searchGame,
  getGameDetails,
  createSlug,
  CACHE_KEY_PREFIX,
  DEFAULT_TTL_DAYS
};
