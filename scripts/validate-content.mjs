/**
 * Validate every content entry against the REAL collection schemas from
 * src/content.config.ts. Astro's build aborts on the first bad entry — this
 * reports all of them at once, so CMS edits can be fixed in one pass.
 *
 * Usage: pnpm validate:content
 */
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { z } from 'astro/zod';
import yaml from 'yaml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Stub the astro-only imports so the real config file can be evaluated here.
const stubPlugin = {
  name: 'astro-stubs',
  setup(build) {
    build.onResolve({ filter: /^astro:content$|^astro\/loaders$/ }, (a) => ({
      path: a.path,
      namespace: 'stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => {
      if (a.path === 'astro/loaders') {
        return { contents: `export const glob = (o) => o;`, loader: 'js' };
      }
      return {
        contents: `
          import { z } from 'astro/zod';
          export { z };
          export const defineCollection = (c) => c;
          export const reference = (collection) =>
            z.string().transform((id) => ({ __ref: collection, id }));
        `,
        loader: 'js',
      };
    });
  },
};

const built = await esbuild.build({
  entryPoints: [join(ROOT, 'src/content.config.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
  external: ['astro/zod'],
  plugins: [stubPlugin],
});

// Must land inside the project so the bundle's bare `zod` import resolves.
const tmp = join(ROOT, 'scripts', '.content-config.compiled.mjs');
writeFileSync(tmp, built.outputFiles[0].text);
let collections;
try {
  ({ collections } = await import(tmp));
} finally {
  unlinkSync(tmp);
}

// image() stub for the news schema factory.
const imageStub = () => z.string();

const BASES = {
  courses: 'src/content/courses',
  news: 'src/content/news',
  instructors: 'src/content/instructors',
  projects: 'src/content/projects',
};

// Collect slugs first so reference() targets can be checked.
const slugs = {};
for (const [name, base] of Object.entries(BASES)) {
  slugs[name] = new Set(
    readdirSync(join(ROOT, base))
      .filter((f) => /\.mdx?$/.test(f))
      .map((f) => basename(f, extname(f)))
  );
}

function frontmatter(file) {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { error: 'no frontmatter block' };
  try {
    return { data: yaml.parse(m[1]) ?? {} };
  } catch (e) {
    return { error: 'YAML parse: ' + e.message };
  }
}

const problems = [];

for (const [name, base] of Object.entries(BASES)) {
  const def = collections[name];
  const schema = typeof def.schema === 'function' ? def.schema({ image: imageStub }) : def.schema;
  const files = readdirSync(join(ROOT, base)).filter((f) => /\.mdx?$/.test(f));

  for (const f of files) {
    const path = join(base, f);
    const { data, error } = frontmatter(join(ROOT, path));
    if (error) {
      problems.push({ path, field: '(file)', msg: error });
      continue;
    }
    const res = schema.safeParse(data);
    if (!res.success) {
      for (const issue of res.error.issues) {
        problems.push({
          path,
          field: issue.path.join('.') || '(root)',
          msg: issue.message,
          extra: detail(issue, data),
        });
      }
      continue;
    }
    // Referential integrity — reference() only resolves at Astro build time.
    checkRefs(res.data, path, problems);
  }
}

function detail(issue, data) {
  if (issue.code === 'too_big' && issue.type === 'string') {
    const val = issue.path.reduce((o, k) => o?.[k], data);
    if (typeof val === 'string') return `${val.length} chars (over by ${val.length - issue.maximum})`;
  }
  return '';
}

function checkRefs(value, path, out, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkRefs(v, path, out, [...trail, i]));
    return;
  }
  if (value && typeof value === 'object') {
    if (value.__ref) {
      if (!slugs[value.__ref]?.has(value.id)) {
        out.push({
          path,
          field: trail.join('.'),
          msg: `reference → ${value.__ref}/${value.id} does not exist`,
        });
      }
      return;
    }
    for (const [k, v] of Object.entries(value)) checkRefs(v, path, out, [...trail, k]);
  }
}

if (!problems.length) {
  console.log('✅ All content entries valid.');
} else {
  console.error(`❌ ${problems.length} problem(s):\n`);
  for (const p of problems) {
    console.error(`${p.path}\n    ${p.field}: ${p.msg}${p.extra ? ` — ${p.extra}` : ''}`);
  }
  process.exit(1);
}
