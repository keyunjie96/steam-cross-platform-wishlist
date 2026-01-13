# Roadmap

## Documentation Bugs (Necessity: 9)

### DOC-2: README US store links outdated
**File:** `README.md:14`
**Issue:** Says "open US store search pages" but URLs are now region-agnostic (commit `542c55e`).

---

## Performance Issues (Necessity: 8)

*No pending performance issues - batch resolution implemented.*

---

## Reliability Issues (Necessity: 6)

### REL-1: Misleading initialization log
**File:** `src/content.js:587-605`
**Issue:** `processWishlistItems()` launches async `processItem()` calls without awaiting. Log says "Initialization complete. Found X appids" but `processedAppIds.size` may still be 0.
**Fix:** Log "Started processing X items" instead, or await all processing.

---

## Missing Components

### MISSING-1: Extension icons for Chrome Web Store
**File:** `manifest.json`
**Issue:** No PNG icons defined (16x16, 48x48, 128x128). Required for Chrome Web Store publishing.
**Fix:** Generate from existing SVGs in `assets/icons/`, add `icons` key to manifest.
**Risk:** Low - straightforward asset generation.

### MISSING-2: Popup UI
**Files:** New `src/popup.html`, `src/popup.js`
**Issue:** No quick-access popup. Users must open options page for cache stats.
**Fix:** Create minimal popup with cache stats and quick-clear button.
**Risk:** Low - isolated feature, no impact on core functionality.

### MISSING-3: Offline mode toggle
**Files:** `src/options.html`, `src/options.js`, `src/resolver.js`
**Issue:** No way to disable Wikidata lookups for privacy-conscious users.
**Fix:** Add toggle in options; when enabled, resolver skips Wikidata and returns "unknown" for all platforms. Icons still link to store searches.
**Risk:** Low - simple conditional in resolver.

---

## Feature Enhancements

### FEAT-2: User preferences (platform visibility)
**Priority:** P2 (Medium Value)
**Files:** `src/options.html`, `src/options.js`, `src/content.js:315-343`, `src/background.js`
**Issue:** Users may only care about specific platforms. No way to hide unwanted icons.
**Fix:**
1. Add checkbox toggles in options.html for each platform
2. Store preferences in `chrome.storage.sync` for cross-device sync
3. Add `GET_USER_PREFERENCES` message handler in background.js
4. Filter visible icons in `updateIconsWithData()` based on preferences
**Risk:** Low - preferences must load before icons render. Use CSS `display:none` instead of DOM removal to avoid BUG-1.

### FEAT-5: HLTB integration (How Long To Beat)
**Priority:** P2 (Medium Value)
**Files:** `src/types.js:12-27`, `src/cache.js`, New `src/hltbClient.js`, `src/content.js:257-275`, `src/background.js`
**Issue:** Users want completion time estimates to prioritize their backlog.
**Data source:** HLTB API (reverse-engineered, `https://howlongtobeat.com/api/search` POST endpoint). Returns `main_story`, `main_extra`, `completionist` hours.
**Fix:**
1. Create `src/hltbClient.js` with `queryByGameName()` function
2. Extend cache entry with optional `hltbData` field
3. Add message handler in background.js
4. Display completion time badge/tooltip in icon row
**Risk:** High - No official HLTB API (reverse-engineered, may break). Name matching is fuzzy (might return wrong game). UI already crowded with 3-4 platform icons. Cache TTL should differ from platform data.

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

### DEBT-1: TypeScript migration
**Files:** All `src/*.js` files
**Issue:** Currently using JSDoc for types. TypeScript would provide better IDE support and catch more errors at compile time.
**Fix:** Convert to TypeScript, add build step with `tsc`.
**Risk:** Medium - Adds build complexity. All tests need updating.

### DEBT-2: Bundle/minify for production
**Files:** Build scripts, `manifest.json`
**Issue:** Currently loads raw JS files. Production build could reduce extension size.
**Fix:** Add webpack/esbuild bundler, minify output.
**Risk:** Low - standard build tooling. Source maps needed for debugging.

---

## Completed

- [x] Stage 0: Appid extraction from Steam wishlist
- [x] Stage 1: Platform icon injection with states
- [x] Stage 2: Wikidata integration for platform data
- [x] Region-agnostic store URLs
- [x] Store ID extraction from Wikidata
- [x] Options page with cache management
- [x] Comprehensive test suite (240 tests)
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
- [x] FEAT-1: Steam Deck verification with ProtonDB tiers (native/platinum/gold/silver/bronze/borked)

---

## Priority Matrix

| ID | Item | Necessity | Confidence | Score | Effort |
|----|------|-----------|------------|-------|--------|
| FEAT-2 | User preferences | 6 | 9 | 54 | Low |
| FEAT-8 | Firefox/Edge | 5 | 6 | 30 | Medium |
| FEAT-5 | HLTB integration | 5 | 4 | 20 | High |
