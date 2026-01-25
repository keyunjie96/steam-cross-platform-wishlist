# Marketing Assets Runbook

This document explains how to regenerate all marketing assets for the Chrome Web Store listing.

## Prerequisites

1. **Local HTTP server** running on port 8765:
   ```bash
   cd /path/to/cross-platform-steam-wishlist
   npx http-server -p 8765 -c-1 &
   ```

2. **librsvg** installed for SVG to PNG conversion:
   ```bash
   brew install librsvg
   ```

3. **Playwright MCP** or browser automation tool for capturing screenshots

## Asset Structure

```
assets/
├── icons/
│   ├── extension-icon.svg    # Master icon (editable)
│   ├── icon16.png            # Generated
│   ├── icon48.png            # Generated
│   ├── icon128.png           # Generated
│   ├── ns.svg                # Platform icons (source)
│   ├── ps.svg
│   ├── xbox.svg
│   └── sd.svg
└── marketing/
    ├── RUNBOOK.md            # This file
    ├── promo-tile-920x680.html   # Large tile template
    ├── promo-tile-920x680.png    # Generated
    ├── promo-tile-440x280.html   # Small tile template
    ├── promo-tile-440x280.png    # Generated
    ├── options-page-full.png     # Generated (screenshot of options)
    └── screenshot-*.png          # Marketing screenshots
```

## Regeneration Steps

### 1. Extension Icons (16/48/128 PNG)

If you modify `extension-icon.svg`:

```bash
cd assets/icons

# Regenerate all sizes
rsvg-convert -w 16 -h 16 extension-icon.svg -o icon16.png
rsvg-convert -w 48 -h 48 extension-icon.svg -o icon48.png
rsvg-convert -w 128 -h 128 extension-icon.svg -o icon128.png
```

### 2. Promotional Tiles

Tiles are HTML templates that can be edited and re-screenshotted.

#### Large Tile (920x680)
- **Template**: `promo-tile-920x680.html`
- **Output**: `promo-tile-920x680.png`
- **Viewport**: 920x680

```bash
# Using Playwright CLI (if available)
playwright screenshot --viewport-size=920,680 \
  http://localhost:8765/assets/marketing/promo-tile-920x680.html \
  assets/marketing/promo-tile-920x680.png
```

#### Small Tile (440x280)
- **Template**: `promo-tile-440x280.html`
- **Output**: `promo-tile-440x280.png`
- **Viewport**: 440x280

```bash
playwright screenshot --viewport-size=440,280 \
  http://localhost:8765/assets/marketing/promo-tile-440x280.html \
  assets/marketing/promo-tile-440x280.png
```

### 3. Options Page Screenshot

```bash
playwright screenshot --viewport-size=640,1200 --full-page \
  http://localhost:8765/src/options.html \
  assets/marketing/options-page-full.png
```

### 4. All-in-One Regeneration Script

Create `scripts/regen-marketing.sh`:

```bash
#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "Starting HTTP server..."
npx http-server -p 8765 -c-1 &
SERVER_PID=$!
sleep 2

echo "Regenerating extension icons..."
cd assets/icons
rsvg-convert -w 16 -h 16 extension-icon.svg -o icon16.png
rsvg-convert -w 48 -h 48 extension-icon.svg -o icon48.png
rsvg-convert -w 128 -h 128 extension-icon.svg -o icon128.png
cd ../..

echo "Regenerating promotional tiles..."
# Large tile
npx playwright screenshot --viewport-size=920,680 \
  "http://localhost:8765/assets/marketing/promo-tile-920x680.html" \
  "assets/marketing/promo-tile-920x680.png"

# Small tile
npx playwright screenshot --viewport-size=440,280 \
  "http://localhost:8765/assets/marketing/promo-tile-440x280.html" \
  "assets/marketing/promo-tile-440x280.png"

# Options page
npx playwright screenshot --viewport-size=640,1200 --full-page \
  "http://localhost:8765/src/options.html" \
  "assets/marketing/options-page-full.png"

echo "Stopping HTTP server..."
kill $SERVER_PID 2>/dev/null || true

echo "Done! Marketing assets regenerated."
```

Make executable: `chmod +x scripts/regen-marketing.sh`

## Customization Guide

### Changing Colors

All marketing templates use CSS variables. Key colors:

| Variable | Value | Usage |
|----------|-------|-------|
| `--nintendo` | `#e60012` | Nintendo Switch red |
| `--playstation` | `#006fcd` | PlayStation blue |
| `--xbox` | `#107c10` | Xbox green |
| `--steamdeck` | `#8b5cf6` | Steam Deck purple |
| `--accent-steam` | `#66c0f4` | Steam blue accent |
| `--bg-deep` | `#0e1419` | Darkest background |
| `--bg-raised` | `#1e2837` | Card backgrounds |

### Changing Games in Mockups

Edit `promo-tile-920x680.html` and update the `.wishlist-card` elements:
- Change game names in `.game-art` and `.game-title`
- Add/remove platform icons as needed
- Update HLTB times in `.hltb-badge`

### Changing Tagline

Edit the `<h1 class="tagline">` in the promotional tile templates.

### Changing Extension Icon Design

1. Edit `assets/icons/extension-icon.svg`
2. Run the icon regeneration commands
3. The design uses:
   - Blue gradient circle (Steam-inspired)
   - Controller silhouette center
   - Four colored corner dots (platform indicators)

## Chrome Web Store Requirements

| Asset | Size | Format | Required |
|-------|------|--------|----------|
| Icon | 128x128 | PNG | Yes |
| Screenshot | 1280x800 or 640x400 | PNG/JPEG | Yes (1-5) |
| Small promo tile | 440x280 | PNG | No |
| Large promo tile | 920x680 | PNG | No |
| Marquee | 1400x560 | PNG | No |

## Troubleshooting

### HTTP server won't start
- Check if port 8765 is in use: `lsof -i :8765`
- Kill existing process: `kill -9 <PID>`

### Screenshots look wrong
- Ensure fonts are loaded (wait for page load)
- Check viewport size matches template dimensions
- Clear browser cache

### Icons look blurry
- Ensure SVG is properly sized before conversion
- Use `rsvg-convert` (not ImageMagick) for best quality
