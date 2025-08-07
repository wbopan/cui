#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

async function processFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Remove .js from relative imports
  const importRegex = /(import\s+(?:[\w\s{},*]+\s+from\s+)?['"])(\.\.?\/[^'"]+)(\.js)(['"])/g;
  const exportRegex = /(export\s+(?:[\w\s{},*]+\s+from\s+)?['"])(\.\.?\/[^'"]+)(\.js)(['"])/g;
  
  let modified = content;
  let hasChanges = false;
  
  // Remove .js from import statements
  modified = modified.replace(importRegex, (match, prefix, path, ext, suffix) => {
    hasChanges = true;
    return `${prefix}${path}${suffix}`;
  });
  
  // Remove .js from export statements
  modified = modified.replace(exportRegex, (match, prefix, path, ext, suffix) => {
    hasChanges = true;
    return `${prefix}${path}${suffix}`;
  });
  
  if (hasChanges) {
    await writeFile(filePath, modified);
    console.log(`Reverted imports in: ${filePath}`);
  }
}

async function processDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (['.ts', '.tsx'].includes(ext) && !entry.name.endsWith('.d.ts')) {
        await processFile(fullPath);
      }
    }
  }
}

// Process only the web directory
const webDir = join(process.cwd(), 'src/web');
console.log('Reverting .js extensions in web files...');
processDirectory(webDir)
  .then(() => console.log('Done!'))
  .catch(console.error);