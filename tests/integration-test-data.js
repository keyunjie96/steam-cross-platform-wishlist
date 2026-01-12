/**
 * Integration Test Dataset - 50 Games
 *
 * Tests Wikidata coverage and accuracy for platform availability.
 * Run with: node tests/run-integration-test.js
 */

const TEST_GAMES = {
  // ============================================================================
  // MULTI-PLATFORM AAA (15 games)
  // Expected: Available on multiple consoles, good Wikidata coverage
  // ============================================================================
  multiPlatform: [
    { appid: '367520', name: 'Hollow Knight', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '1145360', name: 'Hades', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '504230', name: 'Celeste', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '413150', name: 'Stardew Valley', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '268910', name: 'Cuphead', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '588650', name: 'Dead Cells', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '250760', name: 'Shovel Knight', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '391540', name: 'Undertale', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '261570', name: 'Ori and the Blind Forest', expected: { nintendo: true, playstation: false, xbox: true } },
    { appid: '292030', name: 'The Witcher 3', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '374320', name: 'Dark Souls III', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '1245620', name: 'Elden Ring', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '814380', name: 'Sekiro', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '1446780', name: 'Monster Hunter Rise', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '1687950', name: 'Persona 5 Royal', expected: { nintendo: true, playstation: true, xbox: true } },
  ],

  // ============================================================================
  // PC-ONLY / PC-FIRST (15 games)
  // Expected: NOT available on consoles (or very limited)
  // ============================================================================
  pcOnly: [
    { appid: '427520', name: 'Factorio', expected: { nintendo: true, playstation: false, xbox: false } },
    { appid: '294100', name: 'RimWorld', expected: { nintendo: false, playstation: false, xbox: false } },
    { appid: '975370', name: 'Dwarf Fortress', expected: { nintendo: false, playstation: false, xbox: false } },
    { appid: '233860', name: 'Kenshi', expected: { nintendo: false, playstation: false, xbox: false } },
    { appid: '1158310', name: 'Crusader Kings III', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '529340', name: 'Victoria 3', expected: { nintendo: false, playstation: false, xbox: false } },
    { appid: '394360', name: 'Hearts of Iron IV', expected: { nintendo: false, playstation: false, xbox: false } },
    { appid: '236850', name: 'Europa Universalis IV', expected: { nintendo: false, playstation: false, xbox: false } },
    { appid: '281990', name: 'Stellaris', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '1142710', name: 'Total War: Warhammer III', expected: { nintendo: false, playstation: false, xbox: true } },
    { appid: '238960', name: 'Path of Exile', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '892970', name: 'Valheim', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '1086940', name: "Baldur's Gate 3", expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '553420', name: 'Tunic', expected: { nintendo: true, playstation: true, xbox: true } },
    { appid: '548430', name: 'Deep Rock Galactic', expected: { nintendo: false, playstation: true, xbox: true } },
  ],

  // ============================================================================
  // PLATFORM EXCLUSIVES / PARTIAL (10 games)
  // Expected: Mixed availability - tests partial matching
  // ============================================================================
  partialPlatform: [
    { appid: '1817070', name: 'Marvels Spider-Man Remastered', expected: { nintendo: false, playstation: true, xbox: false } },
    { appid: '1817190', name: 'Marvels Spider-Man Miles Morales', expected: { nintendo: false, playstation: true, xbox: false } },
    { appid: '1593500', name: 'God of War', expected: { nintendo: false, playstation: true, xbox: false } },
    { appid: '2322010', name: 'Horizon Zero Dawn Remastered', expected: { nintendo: false, playstation: true, xbox: false } },
    { appid: '1938090', name: 'Call of Duty Modern Warfare II', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '1245620', name: 'Elden Ring', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '493520', name: 'GTFO', expected: { nintendo: false, playstation: false, xbox: false } },
    { appid: '1174180', name: 'Red Dead Redemption 2', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '1551360', name: 'Forza Horizon 5', expected: { nintendo: false, playstation: true, xbox: true } },
    { appid: '1240440', name: 'Halo Infinite', expected: { nintendo: false, playstation: false, xbox: true } },
  ],

  // ============================================================================
  // CHINESE INDIE GAMES (10 games)
  // Expected: Likely NOT in Wikidata - tests fallback behavior
  // ============================================================================
  chineseIndie: [
    { appid: '2358720', name: 'Black Myth: Wukong', expected: { nintendo: false, playstation: true, xbox: true }, likelyInWikidata: true },
    { appid: '1468810', name: 'Tale of Immortal (鬼谷八荒)', expected: { nintendo: true, playstation: false, xbox: false }, likelyInWikidata: true },
    { appid: '1366540', name: 'Dyson Sphere Program', expected: { nintendo: false, playstation: false, xbox: false }, likelyInWikidata: true },
    { appid: '955900', name: 'Amazing Cultivation Simulator', expected: { nintendo: false, playstation: false, xbox: false }, likelyInWikidata: false },
    { appid: '1550890', name: 'Michangsheng (觅长生)', expected: { nintendo: false, playstation: false, xbox: false }, likelyInWikidata: false },
    { appid: '838350', name: 'The Scroll Of Taiwu', expected: { nintendo: false, playstation: false, xbox: false }, likelyInWikidata: false },
    { appid: '1288310', name: 'Firework (烟火)', expected: { nintendo: false, playstation: false, xbox: false }, likelyInWikidata: true },
    { appid: '666140', name: 'My Time at Portia', expected: { nintendo: true, playstation: true, xbox: true }, likelyInWikidata: true },
    { appid: '1084600', name: 'My Time at Sandrock', expected: { nintendo: true, playstation: true, xbox: true }, likelyInWikidata: true },
    { appid: '1094520', name: 'Sands of Salzaar', expected: { nintendo: false, playstation: false, xbox: false }, likelyInWikidata: true },
  ],
};

// Flatten all games for easy iteration
const ALL_GAMES = [
  ...TEST_GAMES.multiPlatform,
  ...TEST_GAMES.pcOnly,
  ...TEST_GAMES.partialPlatform,
  ...TEST_GAMES.chineseIndie,
];

module.exports = { TEST_GAMES, ALL_GAMES };
