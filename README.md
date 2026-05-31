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

## Deployment

The site is hosted on **Cloudflare Pages**. There are two supported ways to deploy:

### Option A — GitHub Actions (this repo)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the site and deploys it with
[`wrangler`](https://developers.cloudflare.com/workers/wrangler/) on every push to `main`
(production) and on pull requests (per-branch preview URLs).

It requires two **repository secrets** (Settings → Secrets and variables → Actions):

| Secret                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with the **Cloudflare Pages: Edit** permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                           |

The Cloudflare Pages project is referenced as `akademia-dermatoskopii` — update the
`--project-name` flag in the workflow if your project is named differently.

### Option B — Cloudflare Git integration

Alternatively, connect the GitHub repo directly in the Cloudflare dashboard
(Workers & Pages → Create → Pages → Connect to Git) and let Cloudflare build on push. Use:

- **Build command:** `pnpm run build`
- **Build output directory:** `dist`

If you use this option, you can delete the GitHub Actions workflow.

### Custom domain

The production domain `akademiadermatoskopii.pl` is configured in the Cloudflare Pages project
under **Custom domains**. The site URL is also set in
[`astro.config.mjs`](astro.config.mjs) (`site:`) so sitemap and canonical URLs are absolute.
