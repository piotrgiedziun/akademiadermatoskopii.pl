#!/usr/bin/env node
/**
 * One-off migration: pull every post from https://akademiadermatoskopii.pl/wp-json/wp/v2/posts
 * and write it as src/content/news/{slug}.mdx with images downloaded to src/assets/news/{slug}/.
 *
 * Flags:
 *   --limit=N      stop after N posts (useful for testing)
 *   --slug=X       migrate only the post with WP slug X
 *   --dry-run      do everything except writing files (still downloads images)
 *   --skip-images  generate mdx but don't fetch any images (keeps remote URLs as-is)
 *   --force        overwrite existing mdx files
 *
 * Usage:
 *   node scripts/migrate-blog.mjs --slug=za-nami-kolejny-kurs-dermatoskopowy
 *   node scripts/migrate-blog.mjs --limit=5
 *   node scripts/migrate-blog.mjs           # full run
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'src/content/news');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'src/assets/news');

const SITE = 'https://akademiadermatoskopii.pl';
const PER_PAGE = 100;
const UA = 'akademia-dermatoskopii-migration/1.0';
const AUTHOR_REF = 'jacek-calik';
const TAG_BY_CATEGORY = { 1: 'kursy', 4: 'artykuł', 19: 'video' };

// -------- CLI -------- //
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const ONLY_SLUG = args.slug || null;
const DRY_RUN = !!args['dry-run'];
const SKIP_IMAGES = !!args['skip-images'];
const FORCE = !!args.force;

// -------- HTML helpers -------- //
const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#039;': "'", '&#39;': "'", '&apos;': "'",
  '&nbsp;': ' ', '&hellip;': '…',
  '&#8211;': '–', '&#8212;': '—',
  '&#8216;': '‘', '&#8217;': '’',
  '&#8220;': '“', '&#8221;': '”',
  '&#8230;': '…', '&laquo;': '«', '&raquo;': '»',
};
function decodeEntities(s) {
  return s
    .replace(/&(amp|lt|gt|quot|#0?39|apos|nbsp|hellip|#82(1[16-7]|2[01]|30)|laquo|raquo);/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}
function stripHtml(s) {
  // Convert block-ish tags to spaces so adjacent text doesn't run together
  const spaced = s
    .replace(/<\s*(br|p|li|div|h[1-6])[^>]*>/gi, ' ')
    .replace(/<\/\s*(br|p|li|div|h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(spaced).replace(/\s+/g, ' ').trim();
}

// -------- Turndown -------- //
const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});
td.remove(['script', 'style']);
// Strip <a> wrappers around standalone images (WP galleries link each image to its full-size version)
td.addRule('linkWrappedImage', {
  filter: (node) =>
    node.nodeName === 'A' &&
    node.childNodes.length === 1 &&
    node.firstChild.nodeName === 'IMG',
  replacement: (_c, node) => {
    const img = node.firstChild;
    const src = img.getAttribute('src') || '';
    const alt = (img.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
    return src ? `\n\n![${alt}](${src})\n\n` : '';
  },
});
// Preserve images as md; we'll rewrite src later
td.addRule('img', {
  filter: 'img',
  replacement: (_c, node) => {
    const src = node.getAttribute('src') || '';
    const alt = (node.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
    return src ? `\n\n![${alt}](${src})\n\n` : '';
  },
});
// Drop figure wrappers but keep caption as italic line under image
td.addRule('figure', {
  filter: 'figure',
  replacement: (content) => `\n\n${content.trim()}\n\n`,
});
td.addRule('figcaption', {
  filter: 'figcaption',
  replacement: (content) => content ? `*${content.trim()}*` : '',
});

// -------- Summary -------- //
function makeSummary(post) {
  // Prefer the first paragraph from content (WP-generated excerpt mangles spacing around <br>)
  const paragraphs = [...(post.content.rendered || '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length >= 30);
  let text = paragraphs[0] || stripHtml(post.excerpt?.rendered || '') || stripHtml(post.title.rendered);
  text = text.replace(/\s*\[…\]\s*$/, '…');
  if (text.length <= 250) return text;
  const cut = text.slice(0, 250);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

// -------- YAML helpers -------- //
function yamlString(s) {
  // YAML double-quoted scalar: backslash + double-quote need escaping; control chars too.
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\t]/g, ' ').trim()}"`;
}

// -------- Image filename normalization -------- //
function localFilenameFromUrl(url) {
  const u = new URL(url);
  let name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'image');
  name = name.replace(/-scaled(\.[a-z]+)$/i, '$1');
  name = name.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1');
  name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Avoid filename collisions across different originals: prefix with hash if same name already used in dir
  return name.slice(0, 120) || 'image';
}
function originalUrl(url) {
  return url.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1').replace(/-scaled(\.[a-z]+)$/i, '$1');
}

// -------- Fetch / download -------- //
async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function downloadImage(remoteUrl, destPath) {
  if (existsSync(destPath)) return true;
  for (const tryUrl of [originalUrl(remoteUrl), remoteUrl]) {
    try {
      const res = await fetch(tryUrl, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(destPath, buf);
      return true;
    } catch (_) { /* try next */ }
  }
  return false;
}

// -------- Per-post processing -------- //
function sanitizeSlug(rawSlug) {
  // WP sometimes returns slugs with percent-encoded UTF-8 (e.g. "co%e2%82%82"). Strip those entities
  // since they create filesystem paths that break Astro's image resolver.
  return rawSlug
    .replace(/(%[0-9a-f]{2})+/gi, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

async function processPost(post) {
  const slug = sanitizeSlug(post.slug);
  const mdxPath = path.join(CONTENT_DIR, `${slug}.md`);
  if (existsSync(mdxPath) && !FORCE) {
    console.log(`  · skip (exists): ${slug}.md`);
    return { status: 'skipped', slug };
  }

  const postAssetDir = path.join(ASSETS_DIR, slug);
  const urlMap = new Map();
  let heroFile = null;
  let heroAlt = null;

  // Featured image
  const featured = post._embedded?.['wp:featuredmedia']?.[0];
  if (featured?.source_url) {
    heroAlt = featured.alt_text || null;
    if (!SKIP_IMAGES) {
      const fname = localFilenameFromUrl(featured.source_url);
      await fs.mkdir(postAssetDir, { recursive: true });
      const ok = await downloadImage(featured.source_url, path.join(postAssetDir, fname));
      if (ok) {
        heroFile = fname;
        urlMap.set(featured.source_url, fname);
      }
    }
  }

  // Inline images
  if (!SKIP_IMAGES) {
    const inlineUrls = [...post.content.rendered.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((u) => /^https?:\/\//.test(u));
    for (const url of new Set(inlineUrls)) {
      if (urlMap.has(url)) continue;
      let fname = localFilenameFromUrl(url);
      // If a different remote already used this filename, prefix with short hash
      const used = new Set(urlMap.values());
      if (used.has(fname)) {
        const hash = Math.abs([...url].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)).toString(36).slice(0, 6);
        fname = `${hash}-${fname}`;
      }
      await fs.mkdir(postAssetDir, { recursive: true });
      const ok = await downloadImage(url, path.join(postAssetDir, fname));
      if (ok) urlMap.set(url, fname);
    }
  }

  // HTML body → strip WP block comments → turndown → rewrite image paths
  let html = post.content.rendered;
  html = html.replace(/<!--\s*\/?wp:[^>]*-->/g, '');
  let body = td.turndown(html);

  // Rewrite remote image URLs in MD to local relative paths from the mdx file
  const relAssetPrefix = path.relative(path.dirname(mdxPath), postAssetDir).split(path.sep).join('/');
  for (const [remoteUrl, fname] of urlMap.entries()) {
    const escaped = remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp(escaped, 'g'), `${relAssetPrefix}/${fname}`);
  }

  // Tidy
  body = decodeEntities(body);
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  // Frontmatter
  const title = decodeEntities(post.title.rendered).replace(/<[^>]+>/g, '').trim();
  const summary = makeSummary(post);
  const publishedAt = post.date.slice(0, 10);
  const modified = post.modified.slice(0, 10);
  const tags = [...new Set((post.categories || []).map((c) => TAG_BY_CATEGORY[c]).filter(Boolean))];

  let fm = '---\n';
  fm += `title: ${yamlString(title)}\n`;
  fm += `summary: ${yamlString(summary)}\n`;
  fm += `publishedAt: ${publishedAt}\n`;
  if (modified && modified !== publishedAt) fm += `updatedAt: ${modified}\n`;
  fm += `author: ${AUTHOR_REF}\n`;
  if (tags.length) fm += `tags: [${tags.map(yamlString).join(', ')}]\n`;
  if (heroFile) {
    fm += `heroImage: ${relAssetPrefix}/${heroFile}\n`;
    if (heroAlt) fm += `heroImageAlt: ${yamlString(heroAlt)}\n`;
  }
  fm += '---\n\n';

  const out = fm + body + '\n';

  if (DRY_RUN) {
    console.log(`  · dry-run: would write ${path.relative(PROJECT_ROOT, mdxPath)} (${out.length} bytes, ${urlMap.size} imgs)`);
    return { status: 'dry-run', slug, bytes: out.length, images: urlMap.size, preview: out };
  }

  await fs.mkdir(CONTENT_DIR, { recursive: true });
  await fs.writeFile(mdxPath, out);
  console.log(`  ✓ ${slug}.md  (${urlMap.size} images)`);
  return { status: 'written', slug, images: urlMap.size };
}

// -------- Main -------- //
async function main() {
  console.log(`Migration starting`);
  console.log(`  content dir: ${path.relative(PROJECT_ROOT, CONTENT_DIR)}`);
  console.log(`  assets dir : ${path.relative(PROJECT_ROOT, ASSETS_DIR)}`);
  console.log(`  options    : limit=${LIMIT === Infinity ? 'all' : LIMIT}, slug=${ONLY_SLUG ?? '(all)'}, dryRun=${DRY_RUN}, skipImages=${SKIP_IMAGES}, force=${FORCE}`);
  console.log('');

  // Determine total pages
  const headRes = await fetch(`${SITE}/wp-json/wp/v2/posts?per_page=${PER_PAGE}`, { method: 'HEAD', headers: { 'User-Agent': UA } });
  const totalPages = Number(headRes.headers.get('x-wp-totalpages') || '1');
  const totalPosts = Number(headRes.headers.get('x-wp-total') || '0');
  console.log(`Source: ${totalPosts} posts across ${totalPages} page(s)\n`);

  const results = { written: 0, skipped: 0, errors: 0, dryRun: 0 };
  let processed = 0;

  let foundSlug = false;
  outer: for (let page = 1; page <= totalPages; page++) {
    const posts = await fetchJson(`${SITE}/wp-json/wp/v2/posts?per_page=${PER_PAGE}&page=${page}&_embed=1`);
    console.log(`[page ${page}] ${posts.length} posts`);

    for (const post of posts) {
      if (ONLY_SLUG && post.slug !== ONLY_SLUG) continue;
      try {
        const r = await processPost(post);
        if (r.status === 'written') results.written++;
        else if (r.status === 'skipped') results.skipped++;
        else if (r.status === 'dry-run') results.dryRun++;
      } catch (err) {
        console.error(`  ✗ ${post.slug}: ${err.message}`);
        results.errors++;
      }
      processed++;
      if (ONLY_SLUG) { foundSlug = true; break outer; }
      if (processed >= LIMIT) break outer;
    }
  }
  if (ONLY_SLUG && !foundSlug) console.warn(`(no post found with slug "${ONLY_SLUG}")`);

  console.log('');
  console.log(`Done.  written=${results.written}  skipped=${results.skipped}  dry-run=${results.dryRun}  errors=${results.errors}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
