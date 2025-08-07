#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

async function processFile(filePath, isWebFile) {
  const content = await readFile(filePath, 'utf-8');
  
  // Skip web files
  if (isWebFile) {
    return;
  }
  
  let modified = content;
  let hasChanges = false;
  
  // Fix relative imports (add .js if missing)
  const relativeImportRegex = /((?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?['"])(\.\.?\/[^'"]+)(?<!\.js)(?<!\.json)(?<!\.css)(?<!\.png)(?<!\.svg)(['"])/g;
  modified = modified.replace(relativeImportRegex, (match, prefix, path, suffix) => {
    // Don't add .js to paths that already have an extension
    if (path.match(/\.\w+$/)) {
      return match;
    }
    hasChanges = true;
    return `${prefix}${path}.js${suffix}`;
  });
  
  // Fix @/ imports
  const atImportRegex = /((?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?['"])(@\/[^'"]+)(?<!\.js)(?<!\.json)(?<!\.css)(?<!\.png)(?<!\.svg)(['"])/g;
  modified = modified.replace(atImportRegex, (match, prefix, path, suffix) => {
    // Don't add .js to paths that already have an extension
    if (path.match(/\.\w+$/)) {
      return match;
    }
    
    // Special handling for @/types - should be @/types/index.js
    if (path === '@/types') {
      hasChanges = true;
      return `${prefix}@/types/index.js${suffix}`;
    }
    
    hasChanges = true;
    return `${prefix}${path}.js${suffix}`;
  });
  
  if (hasChanges) {
    await writeFile(filePath, modified);
    console.log(`Fixed imports in: ${filePath}`);
  }
}

async function processDirectory(dir, isWebDir = false) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip certain directories
      if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) {
        continue;
      }
      
      // Check if this is the web directory
      const isWeb = isWebDir || entry.name === 'web';
      await processDirectory(fullPath, isWeb);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (['.ts', '.tsx'].includes(ext) && !entry.name.endsWith('.d.ts')) {
        await processFile(fullPath, isWebDir);
      }
    }
  }
}

// Process the src directory
const srcDir = join(process.cwd(), 'src');
console.log('Fixing all imports in TypeScript files (excluding web directory)...');
processDirectory(srcDir)
  .then(() => console.log('Done!'))
  .catch(console.error);