#!/bin/bash
# Package extension for Chrome Web Store submission
set -e

cd "$(dirname "$0")/.."

# Extract version from manifest.json
VERSION=$(grep '"version"' manifest.json | sed 's/.*: "\([^"]*\)".*/\1/')
FILENAME="steam-cross-platform-wishlist-v${VERSION}.zip"

echo "Building extension..."
npm run build

echo "Packaging v${VERSION}..."

# Remove old package if exists
rm -f "$FILENAME"

# Create zip with only required files
zip -r "$FILENAME" \
  manifest.json \
  dist/*.js \
  src/options.html \
  src/popup.html \
  src/styles.css \
  assets/icons/icon16.png \
  assets/icons/icon48.png \
  assets/icons/icon128.png \
  -x "*.DS_Store" "*.map"

echo ""
echo "Created: $FILENAME ($(du -h "$FILENAME" | cut -f1))"
echo ""
echo "Contents:"
unzip -l "$FILENAME" | grep -E "^\s+[0-9]+" | awk '{print $4}'
