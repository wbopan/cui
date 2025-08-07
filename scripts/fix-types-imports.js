#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

async function processFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Replace @/types imports with @/types/index.js
  const importRegex = /(from\s+['"])(@\/types)(?!\/[^'"])(['"])/g;
  
  let modified = content;
  let hasChanges = false;
  
  // Fix import statements
  modified = modified.replace(importRegex, (match, prefix, path, suffix) => {
    hasChanges = true;
    return `${prefix}${path}/index.js${suffix}`;
  });
  
  if (hasChanges) {
    await writeFile(filePath, modified);
    console.log(`Fixed types import in: ${filePath}`);
  }
}

async function processDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, dist, web and other build directories
      if (!['node_modules', 'dist', '.git', 'coverage', 'web'].includes(entry.name)) {
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
console.log('Fixing @/types imports...');
processDirectory(srcDir)
  .then(() => console.log('Done!'))
  .catch(console.error);