---
paths:
  - "src/**/*.{astro,ts,mjs}"
  - "astro.config.mjs"
---

# Astro

Astro 7, static output. Upgraded from 5 — the config carries three deliberate
non-defaults, each of which changes rendered output if removed:

- `compressHTML: true`. Astro 7 defaults to `'jsx'`, which strips whitespace
  between inline elements and changed the visible text of all 344 pages. Do not
  "modernise" it without diffing the built HTML.
- `markdown.processor: unified({ remarkPlugins: [...] })`. Astro 7 renders
  Markdown with Sätteri; without this, `remarkCmsImages` silently stops running
  and CMS body images ship as broken `/src/assets/…` URLs.
- Collection schemas are Zod 4: `z.url()`, `z.email()` — not `.string().url()`.

## Conventions

- `trailingSlash: 'always'` with `build.format: 'directory'` — every internal
  link ends in `/`.
- Import via the tsconfig aliases (`@/…`, `@components/…`, `@lib/…`).
  `functions/` is excluded from tsconfig on purpose; see `functions.md`.
- `astro check` must stay at 0 errors / 0 warnings. The ~90 `'z' is deprecated`
  hints come from Astro's own re-export and are left alone.

## Pitfalls

- **`getCollection()` order is not stable** and is not part of Astro's API. Any
  list rendered from a collection needs an explicit sort *with a tiebreak* —
  ties silently reordered the RSS feed across the version upgrade. News uses the
  shared `byNewest` / `getPublishedNews` in `src/lib/news.ts`; do not re-inline
  a comparator.
- `src/styles/reset.css` sets `* { margin: 0 }`, which beats the user-agent
  stylesheet regardless of specificity. Anything depending on a browser default
  margin (a modal `<dialog>` is centred by `margin: auto`) must have it restored
  there, not patched per-component.
- `/admin-rejestracje/` builds its DOM with `innerHTML`, so scoped styles never
  match it — its `<style>` block must stay `is:global`.
