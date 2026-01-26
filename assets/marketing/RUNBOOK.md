# Marketing Assets Runbook

This document explains how to regenerate all marketing assets for the Chrome Web Store listing.

## Prerequisites

1. **Node.js** with npm installed
2. **Python 3 with Pillow** for PNG icon generation:
   ```bash
   pip3 install Pillow
   ```

## Asset Structure

```
assets/
├── icons/
│   ├── icon.png              # Master icon (1024x1024 source)
│   ├── icon-cropped.png      # Auto-cropped for better fill
│   ├── icon16.png            # Generated (toolbar)
│   ├── icon48.png            # Generated (extensions page)
│   ├── icon128.png           # Generated (store, options, promo)
│   ├── ns.svg                # Platform icons (source)
│   ├── ps.svg
│   ├── xbox.svg
│   └── sd.svg
└── marketing/
    ├── RUNBOOK.md                    # This file
    ├── chrome-web-store-listing.md   # Store listing copy
    ├── screenshot-1.png              # Source wishlist screenshot
    ├── options-page-full.png         # Options page capture
    ├── promo-tile-440x280.html       # Small tile template
    ├── promo-tile-440x280.png        # Generated
    ├── promo-tile-1280x800.html      # Screenshot v1 (split layout)
    ├── promo-tile-1280x800.png       # Generated
    ├── promo-tile-1280x800-v2.html   # Screenshot v2 (bottom bar)
    ├── promo-tile-1280x800-v2.png    # Generated
    ├── promo-tile-1280x800-v3.html   # Screenshot v3 (centered)
    ├── promo-tile-1280x800-v3.png    # Generated
    ├── promo-tile-1400x560-v2.html   # Marquee v2 (bottom bar)
    ├── promo-tile-1400x560-v2.png    # Generated
    ├── promo-tile-1400x560-v3.html   # Marquee v3 (centered)
    └── promo-tile-1400x560-v3.png    # Generated
```

## Quick Regeneration

Run the all-in-one script:

```bash
./scripts/regen-marketing.sh
```

This script:
1. Crops `icon.png` and generates `icon16.png`, `icon48.png`, `icon128.png`
2. Starts HTTP server on port 8765
3. Captures all promo tiles at 2x resolution via Playwright
4. Downsamples to 1x with LANCZOS for crisp results
5. Captures options page screenshot

## Chrome Web Store Requirements

| Asset | Size | Format | Required |
|-------|------|--------|----------|
| Icon | 128x128 | PNG | Yes |
| Screenshot | 1280x800 or 640x400 | PNG/JPEG | Yes (1-5) |
| Small promo tile | 440x280 | PNG | No |
| Marquee promo tile | 1400x560 | PNG | No |

## Tile Designs

### Small Tile (440x280)
- **Template**: `promo-tile-440x280.html`
- **Design**: Extension icon, platform icons, minimal tagline

### Screenshot (1280x800) - 3 versions
| Version | Template | Design |
|---------|----------|--------|
| v1 | `promo-tile-1280x800.html` | Split layout (branding left, screenshot right) |
| v2 | `promo-tile-1280x800-v2.html` | Full screenshot with bottom bar overlay |
| v3 | `promo-tile-1280x800-v3.html` | Dimmed background, centered content |

### Marquee (1400x560) - 2 versions
| Version | Template | Design |
|---------|----------|--------|
| v2 | `promo-tile-1400x560-v2.html` | Full screenshot with bottom bar overlay |
| v3 | `promo-tile-1400x560-v3.html` | Centered with horizontal icon row |

## Customization

### Changing Colors

All templates use CSS variables:

| Variable | Value | Usage |
|----------|-------|-------|
| `--nintendo-red` | `#e60012` | Nintendo Switch |
| `--playstation-blue` | `#006fcd` | PlayStation |
| `--xbox-green` | `#107c10` | Xbox |
| `--steam-blue` | `#66c0f4` | Steam accent |
| `--steam-darker` | `#171a21` | Dark background |

### Changing Extension Icon

1. Replace `assets/icons/icon.png` with new icon (1024×1024 recommended)
2. Run `./scripts/regen-marketing.sh`

### Updating Screenshot

1. Capture new wishlist screenshot and save as `assets/marketing/screenshot-1.png`
2. Run `./scripts/regen-marketing.sh`

## Troubleshooting

### HTTP server won't start
- Check if port 8765 is in use: `lsof -i :8765`
- Kill existing process: `kill -9 <PID>`

### Screenshots look wrong
- Ensure fonts are loaded (script waits 500ms)
- Check viewport size matches template dimensions

### Icons look blurry
- Ensure source `icon.png` is at least 512×512 (1024×1024 recommended)
- The script uses 2x capture + LANCZOS downsampling for best quality
