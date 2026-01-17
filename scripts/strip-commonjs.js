#!/usr/bin/env node
/**
 * Post-build script to transform CommonJS output for browsers.
 * Chrome extensions run in browser context where 'exports' is not defined.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

const jsFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));

for (const file of jsFiles) {
  const filePath = path.join(distDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  const lines = content.split('\n');
  const cleanedLines = [];

  for (const line of lines) {
    // Skip "use strict";
    if (line.trim() === '"use strict";') continue;

    // Skip Object.defineProperty(exports, "__esModule", ...)
    if (line.includes('Object.defineProperty(exports')) continue;

    // Skip exports.foo = void 0; declarations (single or chained)
    if (/^\s*exports\.\w+\s*=\s*void\s*0;\s*$/.test(line)) continue;
    if (/^\s*(exports\.\w+\s*=\s*)+void\s*0;\s*$/.test(line)) continue;

    // Skip require statements for local modules
    if (/^\s*const\s+\w+\s*=\s*require\("\.\/.+"\);/.test(line)) continue;

    // Skip re-export lines like: exports.VarName = VarName;
    const reExportMatch = line.match(/^\s*exports\.(\w+)\s*=\s*(\w+);\s*$/);
    if (reExportMatch && reExportMatch[1] === reExportMatch[2]) {
      continue;
    }

    // Transform exports.VarName = someFunction; to const VarName = someFunction;
    // But only when it's a function reference (not re-exporting same name)
    if (reExportMatch && reExportMatch[1] !== reExportMatch[2]) {
      cleanedLines.push(line.replace(/^\s*exports\.(\w+)\s*=\s*/, 'const $1 = '));
      continue;
    }

    // Transform exports.VarName = { ... } to const VarName = { ... }
    let transformedLine = line.replace(/^(\s*)exports\.(\w+)(\s*=\s*\{)/, '$1const $2$3');

    // Replace remaining exports.VarName references with just VarName
    transformedLine = transformedLine.replace(/exports\.(\w+)/g, '$1');

    cleanedLines.push(transformedLine);
  }

  fs.writeFileSync(filePath, cleanedLines.join('\n'));
  console.log(`Processed: ${file}`);
}

console.log('Done transforming CommonJS to browser-compatible format');
