# Roadmap

## Critical Bugs (Necessity: 10)

### BUG-2: All icons blanked on any failure
**File:** `src/content.js:532-535`
**Issue:** If `response.data` is null/undefined, we call `iconsContainer.replaceChildren()` which removes ALL icons. User sees nothing instead of graceful degradation.
**Fix:** Keep icons in "unknown" state on failure; retry on next page load.

---

## Documentation Bugs (Necessity: 9)

### DOC-1: README privacy section is incorrect
**File:** `README.md:117-122`
**Issue:** States "No external API requests" and "Only requires host permission for store.steampowered.com"
**Reality:** Extension has host permission for `https://query.wikidata.org/*` and actively fetches from Wikidata.
**Impact:** Misleading for Chrome Web Store privacy disclosure.

### DOC-2: README US store links outdated
**File:** `README.md:14`
**Issue:** Says "open US store search pages" but URLs are now region-agnostic (commit `542c55e`).

---

## Code Quality Issues (Necessity: 4-6)

### CODE-1: Duplicate CSS injection
**Files:** `manifest.json:14-20`, `src/content.js:50-147`
**Issue:** CSS is loaded TWICE - manifest injects `styles.css` automatically, and `injectStyles()` injects identical inline `<style>` tag.
**Measured:** 11 `.xcpw-*` selectors duplicated exactly.
**Fix:** Remove inline CSS injection; rely solely on manifest-loaded `styles.css`.

### CODE-2: Duplicate StoreUrls definition
**Files:** `src/content.js:32-41`, `src/types.js:69-88`
**Issue:** `StoreUrls` defined twice with identical implementation. Content scripts don't load `types.js`, so the `types.js` version is unused.
**Risk:** Implementations can drift; bugs fixed in one place but not the other.
**Fix:** Add `types.js` to content script manifest, OR move `StoreUrls` into `icons.js`.

### CODE-3: Manual overrides ship to production
**File:** `src/cache.js:34-43`
**Issue:** 8 hardcoded manual overrides always return specific data regardless of actual Wikidata results.
**Fix:** Gate behind `DEBUG` flag or remove entirely.

---

## Performance Issues (Necessity: 8)

### PERF-1: Batch resolution not utilized
**Files:** `src/content.js:518-525`, `src/background.js:45-66`, `src/wikidataClient.js:13,198`
**Issue:** Content script sends 1 `GET_PLATFORM_DATA` message per wishlist item. Wikidata client enforces 500ms delay between requests.
**Impact:** Cold cache with N items = minimum 0.5×N seconds. 200 items = 100+ seconds.
**Already implemented but unused:** `wikidataClient.js:300` has `BATCH_SIZE = 20`, `resolver.js:248` exports `batchResolvePlatformData()`.
**Fix:** Add `GET_PLATFORM_DATA_BATCH` message handler; aggregate appids; call batch resolver.
**Potential improvement:** ~20× reduction in Wikidata requests.

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

### FEAT-1: Steam Deck verification status
**Priority:** P1 (High Value)
**Files:** `src/types.js:7-27`, `src/cache.js:11`, `src/icons.js:9-44`, `src/wikidataClient.js:19-31`, `src/content.js:20`
**Issue:** Users want to see Steam Deck compatibility alongside console platforms. Steam Deck is hugely popular.
**Data source:** Wikidata (Q92920695 for Steam Deck platform) or ProtonDB API (`/api/v1/reports/latest?appId={steamAppId}`).
**Fix:**
1. Add `'steamdeck'` to `PLATFORMS` array in types.js and cache.js
2. Add Steam Deck SVG icon to icons.js
3. Add Wikidata QID or ProtonDB client for compatibility data
4. Extend icon row to show 4th platform
**Risk:** Medium - ProtonDB uses tier system (Platinum/Gold/Silver/Bronze) vs binary available/unavailable. May need UI adaptation for multiple tiers.

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

### FEAT-3: Direct store links (already partially implemented)
**Priority:** P2 (Medium Value)
**Files:** Verify `src/wikidataClient.js:86-101`, `src/resolver.js:110-140`, `src/content.js:285-306`
**Issue:** Icons link to store search pages, but Wikidata often has direct store IDs.
**Current state:** Infrastructure exists! `wikidataClient.js` extracts store IDs, `resolver.js` builds URLs, `content.js` accepts `storeUrl` parameter.
**Fix:** Verify end-to-end flow works. May need minor fixes if store URLs aren't being passed correctly.
**Risk:** Low - mostly verification work. Some Wikidata store IDs may be outdated.

### FEAT-4: Wishlist export (CSV/JSON)
**Priority:** P2 (Medium Value)
**Files:** `src/options.html`, `src/options.js`, `src/background.js`
**Issue:** No way to export wishlist with platform availability data for analysis or backup.
**Fix:**
1. Add "Export" button in options.html cache management section
2. Add `EXPORT_CACHE` message handler in background.js
3. Retrieve all cache entries via `chrome.storage.local.get(null)`, filter by prefix
4. Generate CSV/JSON with columns: appid, gameName, ns_status, ps_status, xb_status, ns_url, ps_url, xb_url
5. Trigger download via Blob/data URI
**Risk:** Medium - large wishlists (1000+ items) may hit memory limits. CSV escaping needed for special characters in game names.

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

### FEAT-6: Wishlist categories/folders
**Priority:** P2 (Medium Value)
**Files:** `src/content.js:360-404`, `src/styles.css`
**Issue:** Steam wishlist lacks organization. #1 user-requested feature for 6+ years.
**Challenge:** Steam uses React-based virtualized rendering. Content scripts cannot access React component state.
**Fix (if feasible):**
1. Use MutationObserver (existing pattern) to detect category headers in DOM
2. Look for `data-rfd-draggable-id` patterns indicating separators
3. Parse category from DOM hierarchy or localStorage/sessionStorage
4. Add visual category indicators
**Risk:** Very High - Steam's internal structure changes frequently. Can't access React state from content script. Virtualized list means not all categories in DOM. May need to reverse-engineer and maintain against Steam updates.

### FEAT-7: True Discount indicator
**Priority:** P2 (Medium Value)
**Files:** `src/types.js`, New `src/priceClient.js`, `src/content.js:257-275`, `src/background.js`
**Issue:** Steam's "50% off" may not be historically low. Users want to know if current sale is actually good.
**Data sources:**
- Steam API (`/api/appdetails?appids={id}`) for current price
- IsThereAnyDeal API for historical low
**Fix:**
1. Create `src/priceClient.js` with `getCurrentPrice()` and `getHistoricalLow()` functions
2. Calculate if current discount matches or exceeds historical low
3. Show two-symbol indicator: "historically low on this platform" vs "historically low everywhere"
4. Display in badge or tooltip
**Risk:** High - Region-specific pricing complicates logic. Multiple API calls add latency. Cache TTL for prices should be short (1-2 hours vs 7 days for platforms). Rate limiting from multiple APIs.

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

### FEAT-9: GOG/Epic Games Store platforms
**Priority:** P3 (Lower Priority)
**Files:** `src/types.js:7`, `src/cache.js:11`, `src/icons.js:9-44`, `src/wikidataClient.js`
**Issue:** Users want to see availability on PC storefronts beyond Steam.
**Current state:** Wikidata already extracts GOG (`P2725`) and Epic (`P6278`) IDs at `wikidataClient.js:36-37,72-73,182-189`. Store URL templates exist at lines 96-97. **Not surfaced in UI.**
**Fix:**
1. Decide: treat as "platforms" (same row) or "alternate storefronts" (separate section)
2. Add to `PLATFORMS` array if treating as platforms
3. Add GOG/Epic SVG icons to icons.js
4. Map store IDs to platform availability in resolver.js
**Risk:** Low - infrastructure mostly exists. Philosophical question: are these "platforms" or "storefronts"? UI space constraints if adding 2 more icons to row.

### FEAT-10: ProtonDB/Linux compatibility ratings
**Priority:** P3 (Lower Priority)
**Files:** `src/types.js`, New `src/protondbClient.js`, `src/background.js`, `src/content.js`, `src/options.html/js`
**Issue:** Linux/Steam Deck users want Proton compatibility tier (Platinum/Gold/Silver/Bronze).
**Data source:** ProtonDB API (`https://protondb.com/api/v1/reports/latest?appId={steamAppId}`). Free, no auth.
**Fix:**
1. Create `src/protondbClient.js` with `queryByAppId()` function
2. Add opt-in toggle in options (disabled by default)
3. Display tier badge with color coding (green=Platinum, gold=Gold, etc.)
4. Extend cache entry with `protondbTier` field
**Risk:** Medium - Community-reported data, can be outdated. Shorter cache TTL needed (1-2 days). Not relevant to all users (opt-in solves this).

### FEAT-11: Cross-platform library detection
**Priority:** P3 (Lower Priority)
**Files:** New `src/libraryDetector.js`, `src/background.js`, `src/content.js`, `src/options.html/js`
**Issue:** Users want "You already own this on PS5" indicator to avoid re-buying.
**Data sources (all problematic):**
- Steam API `GetOwnedGames` - requires API key, fails on private profiles
- Browser injection - violates CSP, brittle
- Cross-tab communication - complex UX
**Fix (if feasible):**
1. Add option for user to enter Steam API key
2. Fetch owned games list on demand
3. Compare with wishlist appids
4. Show "Owned" badge on matching items
**Risk:** Very High - Private profiles block API access. Can't reliably detect user's own Steam ID from wishlist URL. Asking users for API key is poor UX. Would need PlayStation/Xbox equivalent APIs which are even more restricted.

### FEAT-12: Game notes per wishlist item
**Priority:** P3 (Lower Priority)
**Files:** `src/types.js`, `src/cache.js`, `src/content.js`, `src/styles.css`
**Issue:** Users want to add personal notes ("Wait for 75% off", "Gift for friend").
**Fix:**
1. Store notes separately from cache: `xcpw_notes_{appid}` in chrome.storage.local
2. Add small note icon/button next to icon row
3. Click opens modal/popover with textarea
4. Show "has note" indicator if notes exist
5. Save on blur/close via message to background worker
**Risk:** Medium - Content script runs in isolated world, modal injection requires careful CSP handling. Storage access needs message channel. Unicode/special character escaping needed.

### FEAT-13: Historical low price display
**Priority:** P3 (Lower Priority)
**Files:** `src/types.js`, New `src/priceClient.js`, `src/content.js`, `src/options.html/js`
**Issue:** Users want to see historical lowest price for informed purchasing.
**Data source:** IsThereAnyDeal API or CheapShark API.
**Fix:** Similar to FEAT-7 but display as separate indicator rather than comparison.
**Constraint:** Must be configurable (on/off toggle in options).
**Risk:** Medium - Same API concerns as FEAT-7. Adds visual clutter if combined with True Discount.

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

### DEBT-3: Consolidate CSS (relates to CODE-1)
**Files:** `src/content.js:50-147`, `src/styles.css`
**Issue:** Duplicate CSS definitions.
**Fix:** Remove inline CSS injection, rely on manifest-loaded stylesheet.
**Risk:** Low - straightforward removal.

### DEBT-4: Consolidate StoreUrls (relates to CODE-2)
**Files:** `src/content.js:32-41`, `src/types.js:69-88`
**Issue:** Duplicate implementation.
**Fix:** Single source of truth in types.js, load via manifest or globalThis.
**Risk:** Low - requires manifest update and testing.

---

## Completed

- [x] Stage 0: Appid extraction from Steam wishlist
- [x] Stage 1: Platform icon injection with states
- [x] Stage 2: Wikidata integration for platform data
- [x] Region-agnostic store URLs
- [x] Store ID extraction from Wikidata
- [x] Options page with cache management
- [x] Comprehensive test suite (239 tests)
- [x] CI/CD with GitHub Actions
- [x] CLAUDE.md project context file
- [x] ROADMAP.md with detailed specs
- [x] src/ directory reorganization
- [x] BUG-1: Fix icons removed for unavailable/unknown states

---

## Priority Matrix

| ID | Item | Necessity | Confidence | Score | Effort |
|----|------|-----------|------------|-------|--------|
| DOC-1 | README privacy incorrect | 9 | 10 | 90 | Trivial |
| PERF-1 | Batch resolution unused | 8 | 10 | 80 | Medium |
| BUG-2 | Blank icons on failure | 6 | 9 | 54 | Low |
| CODE-1 | Duplicate CSS | 5 | 10 | 50 | Trivial |
| CODE-2 | Duplicate StoreUrls | 5 | 10 | 50 | Low |
| FEAT-3 | Direct store links (verify) | 7 | 8 | 56 | Trivial |
| FEAT-2 | User preferences | 6 | 9 | 54 | Low |
| FEAT-1 | Steam Deck status | 7 | 7 | 49 | Medium |
| FEAT-9 | GOG/Epic platforms | 5 | 9 | 45 | Low |
| FEAT-4 | Wishlist export | 5 | 8 | 40 | Medium |
| FEAT-10 | ProtonDB ratings | 4 | 8 | 32 | Medium |
| FEAT-8 | Firefox/Edge | 5 | 6 | 30 | Medium |
| FEAT-12 | Game notes | 4 | 7 | 28 | Medium |
| FEAT-7 | True Discount | 6 | 4 | 24 | High |
| FEAT-5 | HLTB integration | 5 | 4 | 20 | High |
| FEAT-6 | Wishlist categories | 8 | 2 | 16 | Very High |
| FEAT-11 | Library detection | 6 | 2 | 12 | Very High |
