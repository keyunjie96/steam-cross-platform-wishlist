#!/bin/bash
#
# Regenerate all marketing assets for Chrome Web Store
# Usage: ./scripts/regen-marketing.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "================================================"
echo "Marketing Assets Regeneration"
echo "================================================"
echo ""

# Check for required tools
if ! command -v rsvg-convert &> /dev/null; then
    echo "ERROR: rsvg-convert not found. Install with: brew install librsvg"
    exit 1
fi

# Step 1: Regenerate extension icons
echo "[1/4] Regenerating extension icons..."
cd assets/icons
rsvg-convert -w 16 -h 16 extension-icon.svg -o icon16.png
rsvg-convert -w 48 -h 48 extension-icon.svg -o icon48.png
rsvg-convert -w 128 -h 128 extension-icon.svg -o icon128.png
echo "  ✓ icon16.png, icon48.png, icon128.png"
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
