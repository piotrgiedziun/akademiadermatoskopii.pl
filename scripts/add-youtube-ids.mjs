#!/usr/bin/env node
/**
 * One-off: insert youtubeId frontmatter on the 9 video-tagged news posts.
 * Mapping was extracted from the WP REST API (category=video, 2026-05-28).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEWS_DIR = path.resolve(__dirname, '..', 'src/content/news');

const MAP = {
  'maj-miesiacem-swiadomosci-nowotworow-skory': 'bfr_boPe0SU',
  'wyklad-goscia-specjalnego-prof-jan-miodek': 'TJwGYc5Hfmo',
  'v-konferencja-akademii-dermatoskopii-prof-jan-miodek': '0zaFTJqHy_0',
  'zapraszamy-na-v-jubileuszowa-konferencje-akademii-dermatoskopii-08-09-04-2022': 'DBz2Ij1IJJU',
  'prof-jan-miodek-iv-konferencja-akademii-dermatoskopii': 'AGAkNqeTcAA',
  'prof-jan-miodek-metafora': 'dmddINfrJo8',
  'dr-n-med-jacek-calik-rogowacenie-sloneczne-od-diagnostyki-do-leczenia': 'JdsSUcCEe9g',
  'akademia-dermatoskopii-wprowadzenie': '6Tv7DvIlIJ4',
  'dermatoskopia-czy-dermoskopia-prof-jan-miodek': 'bAJOFWVt7TA',
};

for (const [slug, ytId] of Object.entries(MAP)) {
  const p = path.join(NEWS_DIR, `${slug}.md`);
  let src = await fs.readFile(p, 'utf8');

  if (src.includes('youtubeId:')) {
    console.log(`  · already has youtubeId: ${slug}.md`);
    continue;
  }

  // Insert youtubeId line right after the tags: line within frontmatter
  const updated = src.replace(/(tags:\s*\[[^\]]*\]\n)/, (m) => `${m}youtubeId: ${ytId}\n`);
  if (updated === src) {
    console.warn(`  ! couldn't find tags line in ${slug}.md`);
    continue;
  }
  await fs.writeFile(p, updated);
  console.log(`  ✓ ${slug}.md  →  ${ytId}`);
}
