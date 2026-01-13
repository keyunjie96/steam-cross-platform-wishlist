# CLAUDE.md - Project Context for AI Assistants

## Project Overview

**Steam Cross-Platform Wishlist** is a Chrome extension (Manifest V3) that displays platform availability icons (Nintendo Switch, PlayStation, Xbox) on Steam wishlist pages using Wikidata as the data source.

**Version:** 0.5.0
**Status:** Production-ready
**Tech Stack:** Vanilla JavaScript (ES6+), Chrome Extensions API (MV3), Jest

## Architecture

```
┌─────────────────────┐     chrome.runtime.sendMessage     ┌──────────────────────┐
│   Content Script    │ ──────────────────────────────────►│   Service Worker     │
│   (content.js)      │                                    │   (background.js)    │
│                     │ ◄──────────────────────────────────│                      │
│ - Extract appids    │     response with platform data    │ - Message routing    │
│ - Inject icons      │                                    │ - Cache coordination │
│ - Handle scroll     │                                    │                      │
└─────────────────────┘                                    └──────────┬───────────┘
                                                                      │
                                                           ┌──────────▼───────────┐
                                                           │   Resolver           │
                                                           │   (resolver.js)      │
                                                           │                      │
                                                           │ Priority:            │
                                                           │ 1. Cache             │
                                                           │ 2. Manual Overrides  │
                                                           │ 3. Wikidata Query    │
                                                           │ 4. Unknown Fallback  │
                                                           └──────────┬───────────┘
                                                                      │
                                    ┌─────────────────────────────────┴─────────────────────────────────┐
                                    │                                                                   │
                             ┌──────▼──────┐                                                     ┌──────▼──────────┐
                             │ Cache       │                                                     │ WikidataClient  │
                             │ (cache.js)  │                                                     │ (wikidata       │
                             │             │                                                     │  Client.js)     │
                             │ chrome.     │                                                     │                 │
                             │ storage.    │                                                     │ SPARQL queries  │
                             │ local       │                                                     │ Retry logic     │
                             └─────────────┘                                                     └─────────────────┘
```

## Directory Structure

```
├── manifest.json           # Extension manifest (MV3)
├── src/                    # Source files
│   ├── background.js       # Service worker
│   ├── content.js          # Content script
│   ├── cache.js            # Cache module
│   ├── resolver.js         # Resolution orchestrator
│   ├── wikidataClient.js   # Wikidata SPARQL client
│   ├── icons.js            # Icon definitions
│   ├── types.js            # Type definitions
│   ├── options.js          # Options page logic
│   ├── options.html        # Options page UI
│   └── styles.css          # Extension styles
├── tests/                  # Test files
├── assets/icons/           # SVG source icons
└── scripts/                # Utility scripts
```

## Key Files

| File | Purpose | Critical Functions |
|------|---------|-------------------|
| `src/content.js` | DOM manipulation, icon injection | `init()`, `processWishlistItems()`, `createPlatformIcon()`, `updateIconsWithData()` |
| `src/background.js` | Service worker, message routing | Message handlers for `GET_PLATFORM_DATA`, `UPDATE_CACHE` |
| `src/resolver.js` | Orchestrates data resolution | `resolvePlatformData()` |
| `src/cache.js` | Chrome storage operations | `getFromCache()`, `saveToCache()`, `getOrCreatePlatformData()` |
| `src/wikidataClient.js` | Wikidata SPARQL queries | `queryBySteamAppId()`, `executeSparqlQuery()` |
| `src/icons.js` | SVG icons and platform info | `PLATFORM_ICONS`, `PLATFORM_INFO`, `STATUS_INFO` |
| `src/types.js` | JSDoc type definitions, URL builders | `StoreUrls.nintendo()`, `.playstation()`, `.xbox()` |

## Development Workflow

### Running Tests
```bash
npm test                    # All tests
npm run test:unit           # Unit tests with coverage
npm run test:integration    # Integration tests (slow, ~5min)
npm run test:coverage       # Full coverage report
```

### Loading the Extension
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this folder

### Testing Changes
1. Make code changes
2. Go to `chrome://extensions/`
3. Click refresh button on the extension
4. Navigate to a Steam wishlist page

## Key Concepts

### Icon States
- **available**: Full opacity, clickable - opens store page
- **unavailable**: Hidden (not displayed)
- **unknown**: Hidden (not displayed)

### Resolution Priority
1. **Cache**: Check `chrome.storage.local` first (7-day TTL)
2. **Manual Overrides**: Hardcoded test data in `cache.js`
3. **Wikidata**: SPARQL query for platform data
4. **Fallback**: Return "unknown" for all platforms

### Store URLs (Region-Agnostic)
All store URLs auto-redirect to the user's local store:
- Nintendo: `https://www.nintendo.com/search/...`
- PlayStation: `https://store.playstation.com/search/...`
- Xbox: `https://www.xbox.com/search/...`

## Testing Data

Eight games have manual overrides in `cache.js` for development testing:

| Appid | Game | NS | PS | XB |
|-------|------|----|----|-----|
| 367520 | Hollow Knight | ✓ | ✓ | ✓ |
| 1145360 | Hades | ✓ | ✓ | ✓ |
| 504230 | Celeste | ✓ | ✓ | ✓ |
| 413150 | Stardew Valley | ✓ | ✓ | ✓ |
| 632470 | Disco Elysium | ✓ | ✓ | ✓ |
| 1245620 | Elden Ring | ✗ | ✓ | ✓ |
| 1086940 | Baldur's Gate 3 | ✗ | ✓ | ✓ |
| 1091500 | Cyberpunk 2077 | ✗ | ✓ | ✓ |

## Code Conventions

- **Logging**: Use `[XCPW ...]` prefix for all console logs
- **Types**: JSDoc annotations for type safety (no TypeScript)
- **Error Handling**: Graceful fallbacks, never crash the page
- **Privacy**: Wikidata queries for platform data, cache in local storage, no telemetry
- **Accessibility**: ARIA labels, focus states, reduced motion support

## Debug Flags

Each module has a debug flag at the top:
```javascript
const DEBUG = false;           // src/content.js
const RESOLVER_DEBUG = false;  // src/resolver.js
const WIKIDATA_DEBUG = false;  // src/wikidataClient.js
```

Set to `true` for verbose logging during development.

## Test Coverage Thresholds

| File | Lines | Functions |
|------|-------|-----------|
| src/cache.js | 95% | 100% |
| src/resolver.js | 90% | 100% |
| src/wikidataClient.js | 90% | 90% |
| src/background.js | 90% | 80% |
| src/options.js | 100% | 100% |

## Known Limitations

1. **Rate Limiting**: 500ms delay between Wikidata requests to avoid throttling
2. **Cache TTL**: 7 days - games that become available on new platforms won't update until cache expires
3. **Wikidata Coverage**: Not all games have platform data in Wikidata

## Roadmap Maintenance

**IMPORTANT:** When completing bug fixes, features, or other items from `ROADMAP.md`:
1. Remove the completed item from its original section
2. Add it to the "Completed" section at the bottom
3. Remove it from the Priority Matrix table
4. Commit these changes alongside the fix

This ensures the roadmap stays current and future agents know what's been done.

## Future Roadmap Ideas

See `ROADMAP.md` for detailed specifications. Focus areas:
- **Console platform availability** (Nintendo/PS/Xbox) - core differentiator
- User preferences for platform visibility
- Steam Deck + ProtonDB tiers (opt-in)
- HLTB integration for backlog prioritization
- Firefox/Edge browser support

Note: Features like price history, game notes, and wishlist categories were evaluated and declined - established extensions (Augmented Steam, SteamDB) already implement them well. See `ROADMAP.md` "Declined Features" section for details.
