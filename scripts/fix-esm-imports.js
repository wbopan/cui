#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

async function processFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Match import statements with relative paths that don't already have .js extension
  const importRegex = /(import\s+(?:[\w\s{},*]+\s+from\s+)?['"])(\.\.?\/[^'"]+)(?<!\.js)(['"])/g;
  const exportRegex = /(export\s+(?:[\w\s{},*]+\s+from\s+)?['"])(\.\.?\/[^'"]+)(?<!\.js)(['"])/g;
  
  let modified = content;
  let hasChanges = false;
  
  // Fix import statements
  modified = modified.replace(importRegex, (match, prefix, path, suffix) => {
    // Don't add .js to paths that already have an extension like .json, .css, etc.
    if (path.match(/\.\w+$/)) {
      return match;
    }
    hasChanges = true;
    return `${prefix}${path}.js${suffix}`;
  });
  
  // Fix export statements
  modified = modified.replace(exportRegex, (match, prefix, path, suffix) => {
    // Don't add .js to paths that already have an extension
    if (path.match(/\.\w+$/)) {
      return match;
    }
    hasChanges = true;
    return `${prefix}${path}.js${suffix}`;
  });
  
  if (hasChanges) {
    await writeFile(filePath, modified);
    console.log(`Fixed imports in: ${filePath}`);
  }
}

async function processDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, dist, and other build directories
      if (!['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) {
        await processDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (['.ts', '.tsx'].includes(ext) && !entry.name.endsWith('.d.ts')) {
        await processFile(fullPath);
      }
    }
  }
}

// Process the src directory
const srcDir = join(process.cwd(), 'src');
console.log('Fixing ESM imports in TypeScript files...');
processDirectory(srcDir)
  .then(() => console.log('Done!'))
  .catch(console.error);