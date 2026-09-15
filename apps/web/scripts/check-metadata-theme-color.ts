#!/usr/bin/env tsx
/**
 * Guard against themeColor regressing into metadata export.
 * Scans all .tsx files in apps/web/src/app for `export const metadata` blocks
 * containing `themeColor` key. Fails if found.
 * Also verifies that apps/web/src/app/layout.tsx has `export const viewport`
 * with `themeColor` in it.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface CheckResult {
  file: string;
  line: number;
  passed: boolean;
  message: string;
}

function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .next, .git, out directories
      if (!['node_modules', '.next', '.git', 'out', 'dist', 'build'].includes(entry.name)) {
        results.push(...findTsxFiles(fullPath));
      }
    } else if (extname(entry.name) === '.tsx') {
      results.push(fullPath);
    }
  }
  return results;
}

function checkMetadataThemeColor(filePath: string): CheckResult[] {
  const content = readFileSync(filePath, 'utf-8');
  const results: CheckResult[] = [];

  // Find export const metadata = { ... } blocks
  // We'll look for "export const metadata" followed by { ... } containing themeColor
  const metadataRegex = /export\s+const\s+metadata\s*=\s*\{([\s\S]*?)\n\}/g;
  let match;
  const lines = content.split('\n');
  
  let inMetadataBlock = false;
  let metadataStartLine = -1;
  let braceDepth = 0;
  let metadataContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check for start of metadata export
    if (!inMetadataBlock && /export\s+const\s+metadata\s*=/.test(line)) {
      inMetadataBlock = true;
      metadataStartLine = lineNum;
      braceDepth = 0;
      metadataContent = '';
      
      // Count opening braces on this line
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      metadataContent = line.substring(line.indexOf('{') + 1);
      
      // If closed on same line
      if (braceDepth === 0) {
        // Check for themeColor in this single-line metadata
        if (metadataContent.includes('themeColor')) {
          return [{
            file: filePath,
            line: lineNum,
            passed: false,
            message: `themeColor found in metadata export`
          }];
        }
        inMetadataBlock = false;
        metadataStartLine = -1;
      }
      continue;
    }
    
    if (inMetadataBlock) {
      metadataContent += '\n' + line;
      
      // Count braces
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      
      if (braceDepth <= 0) {
        // End of metadata block
        if (metadataContent.includes('themeColor')) {
          return [{
            file: filePath,
            line: metadataStartLine,
            passed: false,
            message: `themeColor found in metadata export`
          }];
        }
        inMetadataBlock = false;
        metadataStartLine = -1;
      }
    }
  }
  
  return [];
}

function checkViewportThemeColor(filePath: string): CheckResult {
  const content = readFileSync(filePath, 'utf-8');
  
  // Check for export const viewport with themeColor
  // Matches: export const viewport: Viewport = { ... } or export const viewport = { ... }
  const viewportRegex = /export\s+const\s+viewport\s*(?::\s*\w+)?\s*=\s*\{([\s\S]*?)\}/;
  const match = content.match(viewportRegex);
  
  if (match) {
    const viewportContent = match[1];
    if (viewportContent.includes('themeColor')) {
      return {
        file: filePath,
        line: 1,
        passed: true,
        message: 'viewport export with themeColor found (positive control)'
      };
    }
  }
  
  return {
    file: filePath,
    line: 1,
    passed: false,
    message: 'viewport export with themeColor NOT found (positive control FAILED)'
  };
}

function checkFile(filePath: string): CheckResult[] {
  const results: CheckResult[] = [];
  
  // Check for themeColor in metadata
  const metadataResults = checkMetadataThemeColor(filePath);
  results.push(...metadataResults);
  
  return results;
}

function main() {
  const appDir = join(process.cwd(), 'src', 'app');
  const layoutPath = join(process.cwd(), 'src', 'app', 'layout.tsx');
  
  const allFiles = findTsxFiles(appDir);
  
  let totalPassed = 0;
  let totalFailed = 0;
  const allResults: CheckResult[] = [];
  
  console.log('Checking for themeColor in metadata exports...\n');
  
  // Check all .tsx files
  for (const file of allFiles) {
    const results = checkFile(file);
    for (const result of results) {
      if (result.passed) {
        totalPassed++;
      } else {
        totalFailed++;
      }
      allResults.push(result);
    }
  }
  
  // Check positive control - layout.tsx should have viewport with themeColor
  const viewportResult = checkViewportThemeColor(layoutPath);
  if (viewportResult.passed) {
    totalPassed++;
    console.log(`✅ PASS: ${viewportResult.message} (${viewportResult.file})`);
  } else {
    totalFailed++;
    console.log(`❌ FAIL: ${viewportResult.message} (${viewportResult.file})`);
  }
  allResults.push(viewportResult);
  
  // Print detailed results
  console.log('\n--- Results ---');
  for (const result of allResults) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${result.file}:${result.line} - ${result.message}`);
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`PASS: ${totalPassed}`);
  console.log(`FAIL: ${totalFailed}`);
  
  if (totalFailed > 0) {
    console.log('\n❌ themeColor-guard: FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ themeColor-guard: PASSED');
    process.exit(0);
  }
}

main();