#!/usr/bin/env node
/**
 * Capture marketing screenshots at 2x device pixel ratio
 * Usage: node scripts/capture-2x.js
 *
 * Requires HTTP server running on port 8765:
 *   npx http-server -p 8765 -c-1 &
 */

const { chromium } = require('playwright');
const path = require('path');

const MARKETING_DIR = path.join(__dirname, '..', 'assets', 'marketing');
const BASE_URL = 'http://localhost:8765/assets/marketing';

const TILES = [
  // Chrome Web Store small promo (440x280)
  { name: 'promo-tile-440x280', width: 440, height: 280 },
  // Chrome Web Store screenshot (1280x800)
  { name: 'promo-tile-1280x800', width: 1280, height: 800 },
  { name: 'promo-tile-1280x800-v2', width: 1280, height: 800 },
  { name: 'promo-tile-1280x800-v3', width: 1280, height: 800 },
  // Chrome Web Store marquee (1400x560)
  { name: 'promo-tile-1400x560-v2', width: 1400, height: 560 },
  { name: 'promo-tile-1400x560-v3', width: 1400, height: 560 },
];

async function captureAt2x() {
  console.log('Launching browser with deviceScaleFactor: 2...');

  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 920, height: 680 }
  });

  const page = await context.newPage();

  for (const tile of TILES) {
    // Set viewport for this tile
    await page.setViewportSize({ width: tile.width, height: tile.height });

    // Navigate to the HTML template
    const url = `${BASE_URL}/${tile.name}.html`;
    console.log(`Capturing ${tile.name} at 2x...`);

    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait a bit for fonts to load
    await page.waitForTimeout(500);

    // Screenshot at 2x (outputs 2x pixel dimensions)
    const output2x = path.join(MARKETING_DIR, `${tile.name}-2x.png`);
    await page.screenshot({
      path: output2x,
      type: 'png'
    });

    console.log(`  ✓ ${tile.name}-2x.png (${tile.width * 2}x${tile.height * 2})`);
  }

  // Also capture options page
  console.log('Capturing options page at 2x...');
  await page.setViewportSize({ width: 640, height: 1200 });
  await page.goto('http://localhost:8765/src/options.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(MARKETING_DIR, 'options-page-full-2x.png'),
    type: 'png',
    fullPage: true
  });
  console.log('  ✓ options-page-full-2x.png');

  await browser.close();
  console.log('\nDone! 2x screenshots saved to assets/marketing/');
  console.log('Run the downsample step to create final 1x versions.');
}

captureAt2x().catch(console.error);
