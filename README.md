# Steam Cross-Platform Wishlist

Chrome extension that adds Switch/PlayStation/Xbox availability icons to your Steam wishlist. Uses Wikidata to look up platform data.

## What it does

You're browsing your Steam wishlist wondering "can I play this on my Switch?" - this extension shows you at a glance. Three little icons appear next to each game showing whether it's on Nintendo Switch, PlayStation, or Xbox.

Click an icon to go directly to that platform's store page.

## How it works

1. Extracts game info from your Steam wishlist page
2. Queries Wikidata's SPARQL API for platform availability
3. Caches results locally (7 days) so it's fast on repeat visits
4. Injects icons next to each game

The Wikidata lookup happens in the background. There's a 500ms delay between requests to be nice to their servers.

## Icon states

- **Bright icon** = available, click to open store
- **Bright icon (with "unknown" tooltip)** = Wikidata doesn't have info, click to search
- **Dimmed icon** = not on that platform

## Install

1. Go to `chrome://extensions/`
2. Turn on "Developer mode"
3. Click "Load unpacked"
4. Select this folder

## Project structure

```
src/
  content.js       # DOM stuff, icon injection
  background.js    # Service worker
  resolver.js      # Orchestrates cache/Wikidata lookups
  wikidataClient.js# SPARQL queries
  cache.js         # chrome.storage wrapper
  icons.js         # SVG definitions
  types.js         # JSDoc types, store URL builders
  options.html/js  # Settings page
  styles.css
tests/
assets/icons/
```

## Privacy

- Queries Wikidata for game platform info (external API)
- No analytics or tracking
- All cache data stays in chrome.storage.local
- Store links are region-agnostic (auto-redirects to your local store)

## License

Apache 2.0
