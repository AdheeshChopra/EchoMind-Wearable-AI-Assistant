import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../../server/src');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.ts')) {
      fixFile(fullPath);
    }
  }
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Regex for relative imports/exports
  // Matches: from './foo', from "../foo/bar", import('./foo')
  // Group 1: prefix (from or import()
  // Group 2: quote char
  // Group 3: path
  // Group 4: quote char
  
  const regex = /(from\s+|import\()(['"])(\.\.?\/[^'"]+)(['"])/g;

  const newContent = content.replace(regex, (match, prefix, q1, importPath, q2) => {
    // Skip if it already has an extension
    if (importPath.endsWith('.js') || importPath.endsWith('.json') || importPath.endsWith('.css')) {
      return match;
    }
    
    changed = true;
    return `${prefix}${q1}${importPath}.js${q2}`;
  });

  if (changed) {
    console.log(`Fixing imports in: ${path.relative(srcDir, filePath)}`);
    fs.writeFileSync(filePath, newContent, 'utf8');
  }
}

console.log(`Scanning ${srcDir}...`);
walk(srcDir);
console.log('Done!');
