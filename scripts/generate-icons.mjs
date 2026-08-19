#!/usr/bin/env node
/**
 * Generate raster image assets from the source SVGs:
 *   - public/og/og-default.png    (1200×630) — social share image (SVG isn't supported by FB/X/LinkedIn)
 *   - public/favicon-32.png       (32×32)    — PNG favicon fallback
 *   - public/favicon.ico          (16+32)    — /favicon.ico, requested by path regardless of <link> tags
 *   - public/apple-touch-icon.png (180×180)  — iOS home-screen icon (opaque bg)
 *   - public/icon-192.png         (192×192)  — PWA manifest icon (maskable, padded)
 *   - public/icon-512.png         (512×512)  — PWA manifest icon (maskable, padded)
 *
 * Re-run after editing public/favicon.svg or public/og/og-default.svg:
 *   pnpm node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const faviconSvg = await fs.readFile(path.join(pub, 'favicon.svg'));
const ogSvg = await fs.readFile(path.join(pub, 'og', 'og-default.svg'));

/** Render the favicon mark at `size`, optionally on an opaque white bg, with `pad` fraction of padding. */
async function markPng(size, { opaque = false, pad = 0 } = {}) {
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await sharp(faviconSvg, { density: 384 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: opaque ? WHITE : { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
}

/**
 * Pack PNGs into an .ico container.
 *
 * sharp has no .ico encoder, but ICO entries may be whole PNGs — every browser
 * since IE11 reads them — so the file is a 6-byte header, one 16-byte directory
 * entry per size, then the PNGs verbatim. All little-endian.
 */
function icoFromPngs(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // 1 = icon (2 would be cursor)
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const dir = images.map(({ size, buf }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0); // width  (0 would mean 256)
    entry.writeUInt8(size, 1); // height
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buf.length;
    return entry;
  });

  return Buffer.concat([header, ...dir, ...images.map((i) => i.buf)]);
}

async function write(rel, buf) {
  const out = path.join(pub, rel);
  await fs.writeFile(out, buf);
  console.log(`✓ ${rel} (${buf.length} bytes)`);
}

// OG image: rasterize the 1200×630 SVG straight to PNG.
await write('og/og-default.png', await sharp(ogSvg).resize(1200, 630).png().toBuffer());

// Favicon PNG fallback — transparent, like the SVG in browser tabs.
await write('favicon-32.png', await markPng(32));

// Apple touch icon — opaque white bg (iOS turns transparency black), minimal padding (iOS rounds corners).
await write('apple-touch-icon.png', await markPng(180, { opaque: true, pad: 0.06 }));

// PWA maskable icons — opaque white bg + ~16% padding so the mark stays inside the maskable safe zone.
await write('icon-192.png', await markPng(192, { opaque: true, pad: 0.16 }));
await write('icon-512.png', await markPng(512, { opaque: true, pad: 0.16 }));

// favicon.ico — browsers and crawlers hit /favicon.ico by path whether or not
// the <link> tags point elsewhere, so its absence is a steady drip of 404s.
// 16px renders the tab, 32px the bookmark bar and address bar.
await write(
  'favicon.ico',
  icoFromPngs([
    { size: 16, buf: await markPng(16) },
    { size: 32, buf: await markPng(32) },
  ]),
);

console.log('Done.');
