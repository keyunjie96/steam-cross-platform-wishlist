# Roadmap

## Documentation Bugs (Necessity: 9)

*No pending documentation bugs.*

---

## Performance Issues (Necessity: 8)

*No pending performance issues - batch resolution implemented.*

---

## Bugs (Necessity: 8)

*No pending bugs.*

---

## Reliability Issues (Necessity: 6)

*No pending reliability issues.*

---

## Missing Components

*All critical missing components have been addressed.*

---

## Feature Enhancements

### FEAT-9: ChromeOS support via ProtonDB
**Priority:** P3 (Low Value)
**Files:** New `src/protondbClient.js`, `src/content.js`, `src/icons.js`
**Issue:** No visibility into Linux/ChromeOS/SteamOS compatibility for users on those platforms.
**Data source:** ProtonDB API: `https://www.protondb.com/api/v1/reports/summaries/<appid>.json`
**Fix:**
1. Create `src/protondbClient.js` to fetch ProtonDB ratings
2. Add ChromeOS icon to icons.js with tier-based styling (White:Playable/Hidden:Others)
3. Show icon in content.js based on ProtonDB tier
4. Consider caching with appropriate TTL
**Risk:** Medium - ProtonDB API is unofficial but stable. Tier colors may conflict with existing dimmed/available styling.

### FEAT-10: Review scores (IGN, GameSpot, Metacritic)
**Priority:** P2 (Medium Value)
**Files:** New `src/reviewScoresClient.ts`, `src/content.ts`, `src/types.ts`, `src/background.ts`
**Issue:** Users want review scores to help prioritize their wishlist purchases.
**Data sources:**
- Metacritic: `https://www.metacritic.com/search/game/<name>/results` (web scraping required)
- OpenCritic: `https://api.opencritic.com/api/game/search?criteria=<name>` (public API)
- IGN/GameSpot: No public APIs (may require web scraping or alternative sources)
**Fix:**
1. Create `src/reviewScoresClient.ts` with `queryReviewScores()` function
2. Add review score types to types.ts (metacritic, opencritic scores)
3. Add message handler in background.ts for GET_REVIEW_SCORES
4. Display score badge/tooltip in icon row (similar to HLTB badge)
5. Add user preference toggle in options
**Risk:** High - Metacritic has strict anti-scraping. OpenCritic is more accessible. IGN/GameSpot lack public APIs. Name matching is fuzzy. Consider OpenCritic as primary source (has aggregated scores).

### FEAT-8: Firefox/Edge browser support
**Priority:** P3 (Lower Priority)
**Files:** New `manifest-firefox.json`, build scripts, `src/background.js`
**Issue:** Extension only works on Chrome. Firefox and Edge users excluded.
**Fix:**
1. Create Firefox-compatible manifest (MV2, `background.scripts` instead of `service_worker`)
2. Add Edge-specific manifest settings
3. Create build script to generate browser-specific packages
4. Test on all 3 browsers
**Risk:** Medium - Firefox uses WebExtensions (MV2-like), requires different manifest. Service workers may need polyfill. 3× testing effort. Different store approval processes.

---

## Declined Features

Features below were evaluated and declined because established extensions (Augmented Steam, SteamDB, ProtonDB for Steam) already implement them well, or the technical risk was too high. This extension focuses on **console platform availability** which remains underserved.

| Feature | Reason | Incumbent |
|---------|--------|-----------|
| Wishlist export (CSV/JSON) | Not core to console availability | Augmented Steam |
| Wishlist categories/folders | Very high risk: React state inaccessible | - |
| True Discount indicator | Commoditized | SteamDB, Augmented Steam |
| GOG/Epic platforms | Out of scope: PC storefronts, not consoles | - |
| Library detection | Very high risk: API limitations | - |
| Game notes | Commoditized | Augmented Steam, Steam native |
| Historical low price | Redundant with True Discount | SteamDB, Augmented Steam |

---

## Ideas to Explore

### IDEA-1: Price threshold alerts
**Concept:** Notify user when game hits user-defined price (e.g., "Tell me when Elden Ring is under $30").
**Challenge:** Steam sales are frequent - would generate many notifications. Need smart filtering.
**Approach:** Use `chrome.alarms` API for periodic checks, `chrome.notifications` for alerts.
**Risk:** High user annoyance if too many notifications. Needs careful UX design.

### IDEA-2: Smart removal suggestions
**Concept:** Surface games user might want to remove from wishlist (e.g., games wishlisted 3+ years ago, games with poor reviews).
**Challenge:** Hard to get signal right - what makes a game "removable"?
**Approach:** Analyze wishlist age, review scores, last price drop. Show subtle indicator.
**Risk:** Users may feel patronized. Need opt-in and non-intrusive UI.

---

## Technical Debt

### DEBT-2: Bundle/minify for production
**Files:** Build scripts, `manifest.json`
**Issue:** Currently loads compiled JS files from `dist/`. Production build could reduce extension size.
**Fix:** Add webpack/esbuild bundler, minify output.
**Risk:** Low - standard build tooling. Source maps needed for debugging.

---

## Completed

- [x] DEBT-1: TypeScript migration (converted all src/*.js to TypeScript, added tsc build step)
- [x] Stage 0: Appid extraction from Steam wishlist
- [x] Stage 1: Platform icon injection with states
- [x] Stage 2: Wikidata integration for platform data
- [x] Region-agnostic store URLs
- [x] Store ID extraction from Wikidata
- [x] Options page with cache management
- [x] Comprehensive test suite (385+ tests)
- [x] CI/CD with GitHub Actions
- [x] CLAUDE.md project context file
- [x] ROADMAP.md with detailed specs
- [x] src/ directory reorganization
- [x] PERF-1: Batch resolution for Wikidata queries (~20× improvement)
- [x] BUG-1: Fix icons removed for unavailable/unknown states
- [x] DOC-1: README privacy section corrected for Chrome Web Store disclosure
- [x] BUG-2: Keep icons in unknown state on failure instead of blanking
- [x] CODE-1: Remove duplicate CSS injection (manifest already loads styles.css)
- [x] CODE-2: Consolidate StoreUrls to types.js (added to content script manifest)
- [x] CODE-3: Gate manual overrides behind CACHE_DEBUG flag
- [x] FEAT-3: Direct store links (Nintendo/PS/Xbox IDs → direct URLs via Wikidata)
- [x] FEAT-1: Steam Deck Verified status (via page SSR data extraction)
- [x] DOC-2: README US store links outdated (fixed: region-agnostic links)
- [x] REL-1: Misleading initialization log (now says "Started processing items")
- [x] BUG-3: Icons disappear when wishlist filter is applied (fixed: dual-strategy item detection)
- [x] UX-1: Refine icon loading state (fixed: single loader, dynamic icon injection)
- [x] LIFECYCLE-1: Icon lifecycle management (fixed: cleanupAllIcons on URL change, stale container validation, strengthened duplicate prevention)
- [x] FEAT-2: User preferences for platform visibility (added toggles for Nintendo, PlayStation, Xbox, Steam Deck in options)
- [x] FEAT-5: HLTB integration (How Long To Beat) - displays completion time estimates as a badge in the icon row
- [x] MISSING-1: Extension icons for Chrome Web Store (16x16, 48x48, 128x128 PNG icons created)
- [x] MISSING-2: Popup UI (quick-access popup with cache stats and platform toggles)

---

## Priority Matrix

| ID | Item | Necessity | Confidence | Score | Effort |
|----|------|-----------|------------|-------|--------|
| FEAT-10 | Review Scores | 6 | 5 | 30 | Medium |
| FEAT-8 | Firefox/Edge | 5 | 6 | 30 | Medium |
| FEAT-9 | ChromeOS/ProtonDB | 4 | 5 | 20 | Medium |
