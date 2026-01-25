#!/bin/bash
#
# Regenerate all marketing assets for Chrome Web Store
# Usage: ./scripts/regen-marketing.sh
#
# ICON UPDATE INSTRUCTIONS:
# =========================
# 1. Replace assets/icons/icon.png with your new icon (1024x1024 recommended)
# 2. Run this script: ./scripts/regen-marketing.sh
# 3. Reload extension in chrome://extensions/
#
# This script will:
# - Crop icon.png to remove padding (saves as icon-cropped.png)
# - Generate icon16.png, icon48.png, icon128.png
# - Capture screenshots for all promo tiles
#
# Files that use the icon:
# - manifest.json (icon16, icon48, icon128)
# - src/popup.html (icon128)
# - src/options.html (icon128)
# - assets/marketing/*.html (icon128)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "================================================"
echo "Marketing Assets Regeneration"
echo "================================================"
echo ""

# Step 1: Crop and regenerate extension icons from PNG source
echo "[1/4] Regenerating extension icons from icon.png..."
cd assets/icons
python3 << 'PYTHON_SCRIPT'
from PIL import Image

# Open the source icon
img = Image.open("icon.png")
print(f"  Source: icon.png ({img.size[0]}x{img.size[1]})")

# Convert to RGBA if needed
if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Get the bounding box of non-transparent pixels
bbox = img.getbbox()
if bbox:
    # Add minimal padding (2% of content size)
    content_size = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
    padding = int(content_size * 0.02)

    crop_box = (
        max(0, bbox[0] - padding),
        max(0, bbox[1] - padding),
        min(img.width, bbox[2] + padding),
        min(img.height, bbox[3] + padding)
    )

    # Crop to content with minimal padding
    cropped = img.crop(crop_box)

    # Make it square
    size = max(cropped.size)
    square = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    offset = ((size - cropped.width) // 2, (size - cropped.height) // 2)
    square.paste(cropped, offset)
else:
    square = img

# Save the cropped source
square.save('icon-cropped.png')
print(f"  Cropped: icon-cropped.png ({square.size[0]}x{square.size[1]})")

# Generate all required sizes with high-quality resampling
for target_size in [128, 48, 16]:
    resized = square.resize((target_size, target_size), Image.LANCZOS)
    resized.save(f'icon{target_size}.png')

print("  ✓ icon16.png, icon48.png, icon128.png")
PYTHON_SCRIPT
cd "$PROJECT_ROOT"

# Step 2: Start HTTP server
echo ""
echo "[2/4] Starting HTTP server on port 8765..."
npx http-server -p 8765 -c-1 --silent &
SERVER_PID=$!
sleep 2

# Verify server is running
if ! curl -s http://localhost:8765 > /dev/null; then
    echo "ERROR: HTTP server failed to start"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi
echo "  ✓ Server running (PID: $SERVER_PID)"

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping HTTP server..."
    kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

# Step 3: Capture promotional tiles
echo ""
echo "[3/4] Capturing promotional tiles..."

# Check if playwright is available
if command -v npx &> /dev/null && npx playwright --version &> /dev/null 2>&1; then
    # Large tile (920x680)
    npx playwright screenshot \
        --viewport-size=920,680 \
        "http://localhost:8765/assets/marketing/promo-tile-920x680.html" \
        "assets/marketing/promo-tile-920x680.png" 2>/dev/null
    echo "  ✓ promo-tile-920x680.png"

    # Large tile v2 (920x680)
    npx playwright screenshot \
        --viewport-size=920,680 \
        "http://localhost:8765/assets/marketing/promo-tile-920x680-v2.html" \
        "assets/marketing/promo-tile-920x680-v2.png" 2>/dev/null
    echo "  ✓ promo-tile-920x680-v2.png"

    # Large tile v3 (920x680)
    npx playwright screenshot \
        --viewport-size=920,680 \
        "http://localhost:8765/assets/marketing/promo-tile-920x680-v3.html" \
        "assets/marketing/promo-tile-920x680-v3.png" 2>/dev/null
    echo "  ✓ promo-tile-920x680-v3.png"

    # Small tile (440x280)
    npx playwright screenshot \
        --viewport-size=440,280 \
        "http://localhost:8765/assets/marketing/promo-tile-440x280.html" \
        "assets/marketing/promo-tile-440x280.png" 2>/dev/null
    echo "  ✓ promo-tile-440x280.png"

    # Options page
    npx playwright screenshot \
        --viewport-size=640,1200 \
        --full-page \
        "http://localhost:8765/src/options.html" \
        "assets/marketing/options-page-full.png" 2>/dev/null
    echo "  ✓ options-page-full.png"
else
    echo "  ⚠ Playwright not available. Skipping screenshot capture."
    echo "    Install with: npm install -g playwright"
    echo "    Or use Claude Code's Playwright MCP to capture manually."
fi

# Step 4: Summary
echo ""
echo "[4/4] Summary"
echo "================================================"
echo ""
echo "Generated files:"
ls -la assets/icons/icon*.png 2>/dev/null | awk '{print "  " $NF " (" $5 " bytes)"}'
ls -la assets/marketing/*.png 2>/dev/null | awk '{print "  " $NF " (" $5 " bytes)"}'
echo ""
echo "Done! Review assets in assets/icons/ and assets/marketing/"
