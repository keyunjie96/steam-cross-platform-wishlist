# Steam Cross-Platform Wishlist

A Chrome extension that shows cross-platform availability (Switch/PlayStation/Xbox) on Steam wishlist pages.

## Features

### Stage 0: Appid Extraction
- Extracts Steam appids from wishlist rows
- Handles infinite scroll via MutationObserver
- Idempotent processing (no duplicate handling)

### Stage 1: Platform Icons
- Injects platform availability icons (NS/PS/XB) next to existing OS icons
- Icons are clickable and open US store search pages:
  - Nintendo: Nintendo eShop search
  - PlayStation: PlayStation Store search
  - Xbox: Xbox Store search
- Local caching with chrome.storage.local:
  - Cache keyed by Steam appid
  - Stores platform status, store URLs, and TTL
  - Instant render from cache on page reload
- Three icon states:
  - **Available** (full opacity): Game confirmed on platform - click to view
  - **Unknown** (full opacity): Status unknown - click to search (see tooltip)
  - **Unavailable** (dimmed): Game not on platform - not clickable
- Manual override map for testing specific appids

## Icon States

| State | Appearance | Behavior |
|-------|------------|----------|
| Available | Full opacity, white | Clickable - opens store page |
| Unknown | Full opacity, white | Clickable - opens search |
| Unavailable | Dimmed | Not clickable |

## Sample Appids with Overrides

For testing, these appids have manual overrides:

| Appid | Game | NS | PS | XB |
|-------|------|----|----|-----|
| 367520 | Hollow Knight | ✓ | ✓ | ✓ |
| 1245620 | Elden Ring | ✗ | ✓ | ✓ |
| 1145360 | Hades | ✓ | ✓ | ✓ |
| 504230 | Celeste | ✓ | ✓ | ✓ |
| 1086940 | Baldur's Gate 3 | ✗ | ✓ | ✓ |
| 413150 | Stardew Valley | ✓ | ✓ | ✓ |
| 632470 | Disco Elysium | ✓ | ✓ | ✓ |
| 1091500 | Cyberpunk 2077 | ✗ | ✓ | ✓ |

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select this folder

## Testing

### Basic Functionality
1. Navigate to a Steam wishlist page (e.g., `https://store.steampowered.com/wishlist/profiles/YOUR_STEAM_ID/`)
2. You should see three small icons (NS, PS, XB) appear next to each game's OS icons
3. Open Chrome DevTools (F12) → Console to see log messages

### Cache Behavior
1. Reload the page
2. Icons should render instantly (from cache)
3. Console shows "Rendered from cache" messages

### Infinite Scroll
1. Scroll down to trigger infinite scroll loading
2. Newly loaded rows should get icons automatically
3. No duplicate icons should appear

### Click Behavior
1. Click an "available" (full opacity) icon → Opens store page in new tab
2. Click an "unknown" (dimmed) icon → Opens search in new tab
3. "Unavailable" icons are not clickable

### Tooltips
Hover over any icon to see its status tooltip.

## Project Structure

```
├── manifest.json    # Extension manifest (MV3)
├── background.js    # Service worker for caching
├── content.js       # Content script with icon injection
├── cache.js         # Cache operations module
├── types.js         # JSDoc type definitions
├── icons.js         # SVG icon definitions
├── styles.css       # Scoped CSS styles
├── assets/icons/    # Official SVGs (input for normalization)
├── scripts/         # Icon normalization utilities
└── README.md
```

## Architecture

```
┌─────────────────┐     chrome.runtime.sendMessage     ┌──────────────────┐
│  Content Script │ ─────────────────────────────────► │ Service Worker   │
│  (content.js)   │                                    │ (background.js)  │
│                 │ ◄───────────────────────────────── │                  │
│  - Extract appid│     response with platform data    │  - Cache module  │
│  - Inject icons │                                    │  - Manual overrides│
│  - Handle scroll│                                    │                  │
└─────────────────┘                                    └──────────────────┘
                                                              │
                                                              ▼
                                                       ┌──────────────────┐
                                                       │ chrome.storage   │
                                                       │     .local       │
                                                       └──────────────────┘
```

## Privacy

- No external API requests
- No telemetry or analytics
- All data stored locally in chrome.storage.local
- Only requires host permission for store.steampowered.com

## License

MIT
