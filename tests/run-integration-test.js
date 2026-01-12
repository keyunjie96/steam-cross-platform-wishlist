#!/usr/bin/env node
/**
 * Integration Test Runner
 *
 * Tests Wikidata SPARQL queries against a curated dataset.
 * Run with: node tests/run-integration-test.js
 */

const { ALL_GAMES, TEST_GAMES } = require('./integration-test-data.js');

const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
const REQUEST_DELAY_MS = 600; // Slightly higher than extension to avoid rate limits

// Platform QIDs from Wikidata
const PLATFORM_QIDS = {
  SWITCH: 'Q19610114',
  PS4: 'Q5014725',
  PS5: 'Q63184502',
  XBOX_ONE: 'Q13361286',
  XBOX_SERIES_X: 'Q64513817',
  XBOX_SERIES_S: 'Q98973368',
};

// Platform-specific store ID properties (for fallback detection when P400 is incomplete)
// Note: Only use ExternalId type properties, not WikibaseItem references
const PLATFORM_STORE_PROPERTIES = {
  // Nintendo (ExternalId type only)
  SWITCH_TITLE_ID: 'P11072',       // Nintendo Switch title ID
  ESHOP_EUROPE_ID: 'P12418',       // Nintendo eShop (Europe) ID
  ESHOP_US_ID: 'P8084',            // Nintendo eShop ID
  // Note: P8956 is "compatible with" (WikibaseItem type), NOT an eShop ID - excluded

  // PlayStation (ExternalId type)
  PS_STORE_EU: 'P5971',            // Europe PlayStation Store ID
  PS_STORE_NA: 'P5944',            // North America PlayStation Store ID
  PS_STORE_CONCEPT: 'P12332',      // PlayStation Store concept ID
  PS_STORE_ID: 'P12069',           // PlayStation Store ID

  // Xbox (ExternalId type)
  MS_STORE_ID: 'P5885',            // Microsoft Store product ID
  PURE_XBOX_ID: 'P12737',          // Pure Xbox game ID
  XBOX_ID: 'P12465'                // Xbox Store ID
};

/**
 * Delays execution
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Queries Wikidata for a game by Steam App ID
 * Uses both P400 (platforms) AND platform-specific store IDs to detect availability
 */
async function queryWikidata(steamAppId) {
  const P = PLATFORM_STORE_PROPERTIES;

  const query = `
    SELECT ?game ?gameLabel
           (GROUP_CONCAT(DISTINCT ?platformQID; separator=",") AS ?platforms)
           (SAMPLE(?switchTitleId) AS ?switchTitle)
           (SAMPLE(?eshopEuId) AS ?eshopEu)
           (SAMPLE(?eshopUsId) AS ?eshopUs)
           (SAMPLE(?psStoreEuId) AS ?psStoreEu)
           (SAMPLE(?psStoreNaId) AS ?psStoreNa)
           (SAMPLE(?psStoreConceptId) AS ?psStoreConcept)
           (SAMPLE(?psStoreId) AS ?psStore)
           (SAMPLE(?msStoreId) AS ?msStore)
           (SAMPLE(?pureXboxId) AS ?pureXbox)
           (SAMPLE(?xboxId) AS ?xbox)
    WHERE {
      ?game wdt:P1733 "${steamAppId}" .
      OPTIONAL {
        ?game wdt:P400 ?platform .
        BIND(STRAFTER(STR(?platform), "entity/") AS ?platformQID)
      }

      # Nintendo platform-specific IDs (ExternalId type only)
      OPTIONAL { ?game wdt:${P.SWITCH_TITLE_ID} ?switchTitleId . }
      OPTIONAL { ?game wdt:${P.ESHOP_EUROPE_ID} ?eshopEuId . }
      OPTIONAL { ?game wdt:${P.ESHOP_US_ID} ?eshopUsId . }
      # Note: P8956 excluded - it's "compatible with" (WikibaseItem), not an eShop ID

      # PlayStation platform-specific IDs
      OPTIONAL { ?game wdt:${P.PS_STORE_EU} ?psStoreEuId . }
      OPTIONAL { ?game wdt:${P.PS_STORE_NA} ?psStoreNaId . }
      OPTIONAL { ?game wdt:${P.PS_STORE_CONCEPT} ?psStoreConceptId . }
      OPTIONAL { ?game wdt:${P.PS_STORE_ID} ?psStoreId . }

      # Xbox platform-specific IDs
      OPTIONAL { ?game wdt:${P.MS_STORE_ID} ?msStoreId . }
      OPTIONAL { ?game wdt:${P.PURE_XBOX_ID} ?pureXboxId . }
      OPTIONAL { ?game wdt:${P.XBOX_ID} ?xboxId . }

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    GROUP BY ?game ?gameLabel
    LIMIT 1
  `;

  const url = new URL(WIKIDATA_SPARQL_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'SteamCrossPlatformWishlist-IntegrationTest/1.0',
    },
  });

  if (response.status === 429) {
    console.log('  ⏳ Rate limited, waiting 5s...');
    await delay(5000);
    return queryWikidata(steamAppId); // Retry
  }

  if (!response.ok) {
    return { found: false, error: `HTTP ${response.status}` };
  }

  const data = await response.json();
  const bindings = data?.results?.bindings;

  if (!bindings || bindings.length === 0) {
    return { found: false };
  }

  const binding = bindings[0];
  const platformQIDs = binding.platforms?.value?.split(',').filter(Boolean) || [];

  // Check platform availability from P400 platforms property
  const hasSwitchP400 = platformQIDs.includes(PLATFORM_QIDS.SWITCH);
  const hasPSP400 = platformQIDs.includes(PLATFORM_QIDS.PS4) || platformQIDs.includes(PLATFORM_QIDS.PS5);
  const hasXboxP400 = platformQIDs.includes(PLATFORM_QIDS.XBOX_ONE) ||
                      platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_X) ||
                      platformQIDs.includes(PLATFORM_QIDS.XBOX_SERIES_S);

  // Check platform availability from platform-specific store IDs (fallback)
  // Note: Only use ExternalId type properties, not WikibaseItem references
  const hasSwitchStoreId = !!(
    binding.switchTitle?.value ||
    binding.eshopEu?.value ||
    binding.eshopUs?.value
    // Note: P8956 excluded - it's "compatible with" (WikibaseItem), not an eShop ID
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

  return {
    found: true,
    wikidataId: binding.game?.value?.split('/').pop(),
    gameLabel: binding.gameLabel?.value,
    platforms: {
      nintendo: hasSwitch,
      playstation: hasPS,
      xbox: hasXbox,
    },
    rawPlatforms: platformQIDs,
    storeIdDetection: {
      nintendo: { p400: hasSwitchP400, storeId: hasSwitchStoreId },
      playstation: { p400: hasPSP400, storeId: hasPSStoreId },
      xbox: { p400: hasXboxP400, storeId: hasXboxStoreId },
    }
  };
}

/**
 * Compares actual vs expected results
 */
function compareResults(expected, actual) {
  if (!actual.found) {
    return { match: false, reason: 'not_in_wikidata' };
  }

  const mismatches = [];

  if (expected.nintendo !== actual.platforms.nintendo) {
    mismatches.push(`nintendo: expected ${expected.nintendo}, got ${actual.platforms.nintendo}`);
  }
  if (expected.playstation !== actual.platforms.playstation) {
    mismatches.push(`playstation: expected ${expected.playstation}, got ${actual.platforms.playstation}`);
  }
  if (expected.xbox !== actual.platforms.xbox) {
    mismatches.push(`xbox: expected ${expected.xbox}, got ${actual.platforms.xbox}`);
  }

  return {
    match: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🎮 Steam Cross-Platform Wishlist - Integration Test');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`Testing ${ALL_GAMES.length} games against Wikidata...\n`);

  const results = {
    total: ALL_GAMES.length,
    found: 0,
    notFound: 0,
    matched: 0,
    mismatched: 0,
    details: [],
  };

  const categoryStats = {
    multiPlatform: { found: 0, matched: 0, total: TEST_GAMES.multiPlatform.length },
    pcOnly: { found: 0, matched: 0, total: TEST_GAMES.pcOnly.length },
    partialPlatform: { found: 0, matched: 0, total: TEST_GAMES.partialPlatform.length },
    chineseIndie: { found: 0, matched: 0, total: TEST_GAMES.chineseIndie.length },
  };

  // Determine category for a game
  function getCategory(appid) {
    if (TEST_GAMES.multiPlatform.find(g => g.appid === appid)) return 'multiPlatform';
    if (TEST_GAMES.pcOnly.find(g => g.appid === appid)) return 'pcOnly';
    if (TEST_GAMES.partialPlatform.find(g => g.appid === appid)) return 'partialPlatform';
    if (TEST_GAMES.chineseIndie.find(g => g.appid === appid)) return 'chineseIndie';
    return 'unknown';
  }

  for (let i = 0; i < ALL_GAMES.length; i++) {
    const game = ALL_GAMES[i];
    const category = getCategory(game.appid);

    process.stdout.write(`[${i + 1}/${ALL_GAMES.length}] ${game.name.padEnd(40)}`);

    const actual = await queryWikidata(game.appid);
    const comparison = compareResults(game.expected, actual);

    if (actual.found) {
      results.found++;
      categoryStats[category].found++;

      if (comparison.match) {
        results.matched++;
        categoryStats[category].matched++;
        console.log('✅ Match');
      } else {
        results.mismatched++;
        console.log('⚠️  Mismatch');
        comparison.mismatches.forEach(m => console.log(`     ${m}`));
      }
    } else {
      results.notFound++;
      console.log('❌ Not in Wikidata');
    }

    results.details.push({
      ...game,
      category,
      actual,
      comparison,
    });

    await delay(REQUEST_DELAY_MS);
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 SUMMARY\n');

  console.log(`Total games tested:    ${results.total}`);
  console.log(`Found in Wikidata:     ${results.found} (${(results.found / results.total * 100).toFixed(1)}%)`);
  console.log(`Not in Wikidata:       ${results.notFound} (${(results.notFound / results.total * 100).toFixed(1)}%)`);
  console.log(`Platform data match:   ${results.matched} (${(results.matched / results.found * 100).toFixed(1)}% of found)`);
  console.log(`Platform data mismatch: ${results.mismatched}`);

  console.log('\n📁 BY CATEGORY:\n');

  const categoryNames = {
    multiPlatform: 'Multi-Platform AAA',
    pcOnly: 'PC-Only',
    partialPlatform: 'Partial Platform',
    chineseIndie: 'Chinese Indie',
  };

  for (const [key, stats] of Object.entries(categoryStats)) {
    const coverage = (stats.found / stats.total * 100).toFixed(0);
    const accuracy = stats.found > 0 ? (stats.matched / stats.found * 100).toFixed(0) : 'N/A';
    console.log(`${categoryNames[key].padEnd(20)} | Found: ${stats.found}/${stats.total} (${coverage}%) | Accurate: ${accuracy}%`);
  }

  // List games not in Wikidata
  const notInWikidata = results.details.filter(d => !d.actual.found);
  if (notInWikidata.length > 0) {
    console.log('\n❌ GAMES NOT IN WIKIDATA:\n');
    notInWikidata.forEach(g => console.log(`   - ${g.name} (${g.appid})`));
  }

  // List mismatches
  const mismatches = results.details.filter(d => d.actual.found && !d.comparison.match);
  if (mismatches.length > 0) {
    console.log('\n⚠️  PLATFORM MISMATCHES:\n');
    mismatches.forEach(g => {
      console.log(`   ${g.name}:`);
      g.comparison.mismatches.forEach(m => console.log(`      - ${m}`));
    });
  }

  console.log('\n═══════════════════════════════════════════════════');

  // Save results to JSON
  const fs = require('fs');
  const outputPath = './tests/integration-test-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Full results saved to: ${outputPath}`);
}

// Run tests
runTests().catch(console.error);
