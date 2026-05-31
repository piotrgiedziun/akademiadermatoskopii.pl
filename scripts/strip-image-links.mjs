#!/usr/bin/env node
/**
 * Strip [![](thumb)](full) link wrappers around images in migrated news posts.
 * WordPress galleries wrap each image in <a href="full-size"> — turndown preserved
 * that as a Markdown link-wrapped image, but the rendered site doesn't need the
 * full-size lightbox link.
 *
 * Usage:
 *   node scripts/strip-image-links.mjs              # apply to all news *.md
 *   node scripts/strip-image-links.mjs --dry-run    # report changes only
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS_DIR = path.join(PROJECT_ROOT, 'src/content/news');
const DRY = process.argv.includes('--dry-run');

// [<whitespace>(![alt](src))<whitespace>](href) — across any number of blank lines
const LINK_WRAPPED_IMAGE = /\[\s*(!\[[^\]]*\]\([^)\s]+\))\s*\]\([^)\s]+\)/g;

const files = (await fs.readdir(NEWS_DIR)).filter((f) => f.endsWith('.md'));
let totalReplacements = 0;
let touchedFiles = 0;

for (const f of files) {
  const p = path.join(NEWS_DIR, f);
  const src = await fs.readFile(p, 'utf8');
  let n = 0;
  const out = src.replace(LINK_WRAPPED_IMAGE, (_m, img) => {
    n++;
    return img;
  });
  if (n > 0) {
    touchedFiles++;
    totalReplacements += n;
    console.log(`  ${DRY ? 'would fix' : 'fixed'}: ${f}  (${n} image link${n === 1 ? '' : 's'})`);
    if (!DRY) await fs.writeFile(p, out);
  }
}

console.log(`\n${DRY ? 'Dry-run.' : 'Done.'}  files=${touchedFiles}  replacements=${totalReplacements}`);
