# Steam Cross-Platform Wishlist

A Chrome extension that shows cross-platform availability (Switch/PlayStation/Xbox) on Steam wishlist pages.

## Features

- Extracts Steam appids from wishlist rows
- Handles infinite scroll via MutationObserver
- Idempotent processing (no duplicate handling)
- Console logging of discovered appids

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select this folder

## Testing

1. Navigate to a Steam wishlist page (e.g., `https://store.steampowered.com/wishlist/profiles/YOUR_STEAM_ID/`)
2. Open Chrome DevTools (F12) → Console
3. You should see log messages like:

   ```
   [Steam Cross-Platform Wishlist] Initializing on wishlist page...
   [Steam Cross-Platform Wishlist] Found appid: 123456
   [Steam Cross-Platform Wishlist] Found appid: 789012
   ```

4. Scroll down to trigger infinite scroll loading
5. Verify newly loaded appids are also logged

## Project Structure

```
├── manifest.json    # Extension manifest (MV3)
├── content.js       # Content script with appid extraction
└── README.md
```

## License

MIT
