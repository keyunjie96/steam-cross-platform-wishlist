#!/usr/bin/env node
/**
 * Build script for Chrome extension.
 * Uses esbuild to compile TypeScript to browser-compatible IIFE format.
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Files to build - each becomes a self-contained IIFE
const files = [
  'types.ts',
  'icons.ts',
  'cache.ts',
  'wikidataClient.ts',
  'steamDeckClient.ts',
  'steamDeckPageScript.ts',
  'reviewScoresClient.ts',
  'resolver.ts',
  'background.ts',
  'content.ts',
  'options.ts',
  'popup.ts',
];

async function build() {
  for (const file of files) {
    const entryPoint = path.join(srcDir, file);
    const outfile = path.join(distDir, file.replace('.ts', '.js'));

    await esbuild.build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      // Mark chrome as external (it's a global in extensions)
      external: ['chrome'],
      // Don't include other source files - they're loaded separately via importScripts/script tags
      plugins: [{
        name: 'externalize-local-imports',
        setup(build) {
          // Mark all ./foo imports as external - we load them via importScripts
          build.onResolve({ filter: /^\.\.?\// }, args => {
            // Only externalize .ts/.js imports from src directory
            if (args.importer.includes('/src/')) {
              return { path: args.path, external: true };
            }
          });
        }
      }]
    });
    console.log(`Built: ${file}`);
  }

  console.log('Build complete!');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
