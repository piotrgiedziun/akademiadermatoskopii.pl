# Akademia Dermatoskopii

Marketing and content site for **Akademia Dermatoskopii** — courses in dermatoscopy, skin surgery, and CO₂ laser, based in Wrocław, Poland.

Built with [Astro](https://astro.build/) as a fully static site and deployed to **Cloudflare Pages**.

- **Production:** https://akademiadermatoskopii.pl
- **Content:** Markdown/MDX collections (`courses`, `instructors`, `news`, `projects`) under `src/content/`

## Tech stack

- [Astro 5](https://astro.build/) — static site generator (`output: 'static'`)
- [MDX](https://docs.astro.build/en/guides/markdown-content/) for rich content pages
- [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/) + RSS feed
- [`sharp`](https://sharp.pixelplumbing.com/) for build-time image optimization
- TypeScript

## Prerequisites

- **Node.js 22** (see [`.nvmrc`](.nvmrc) — run `nvm use`)
- **pnpm** (via `corepack enable`, or a standalone install)

This project uses [**pnpm**](https://pnpm.io/) (pinned via the `packageManager` field). Enable it
with Corepack — `corepack enable` — or install pnpm directly.

## Local development

```bash
pnpm install        # install dependencies
pnpm dev            # start dev server at http://localhost:4321
```

## Build

```bash
pnpm build          # type-check (astro check) + build to dist/
pnpm preview        # serve the production build locally
```

The build emits a static site into `dist/`. Files in [`public/`](public/) — including
[`public/_headers`](public/_headers) (Cloudflare cache & security headers) — are copied to the
output root as-is.

## Content

| Collection    | Location                  | Format     |
| ------------- | ------------------------- | ---------- |
| Courses       | `src/content/courses/`    | MDX        |
| Instructors   | `src/content/instructors/`| MDX        |
| News          | `src/content/news/`       | Markdown   |
| Projects      | `src/content/projects/`   | MDX        |

Collection schemas live in [`src/content.config.ts`](src/content.config.ts). Site-wide constants
(URLs, navigation, social links) are in [`src/consts.ts`](src/consts.ts).

The `scripts/` directory holds one-off migration utilities (e.g. importing legacy WordPress posts);
they are not part of the regular build.
