# Akademia Dermatoskopii

Marketing and content site for **Akademia Dermatoskopii** — courses in dermatoscopy, skin surgery, and CO₂ laser, based in Wrocław, Poland.

Built with [Astro](https://astro.build/) as a static site with a few Cloudflare Pages Functions,
deployed to **Cloudflare Pages**.

- **Production:** https://akademiadermatoskopii.pl
- **Content:** Markdown/MDX collections (`courses`, `instructors`, `news`, `projects`) under `src/content/`

> **This repository is public.** No credentials belong in it. Registrant data (names, PWZ numbers,
> phone numbers, invoice details) lives only in Cloudflare D1 and must never be committed —
> see [Registrations](#registrations) below.

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
[`public/_headers`](public/_headers) (Cloudflare cache & security headers) and
[`public/_redirects`](public/_redirects) — are copied to the output root as-is.

### Caching

HTML sits at the Cloudflare edge for a week via `Cloudflare-CDN-Cache-Control`. That header
outranks the `max-age=0, must-revalidate` Pages sends, and Cloudflare strips it before the response
reaches the browser — so visitors still revalidate on every navigation and never hold stale markup
themselves. Pages does send an `ETag`, but the zone's Email Address Obfuscation rewrites the HTML
body at the edge, so the validator is dropped and no revalidation can come back as a cheap `304`.
The TTL is the only thing keeping page bodies off the origin.

A week-long TTL is safe only because **the deploy workflow purges the zone after every production
deploy**. That step fails the job when the purge fails: a green deploy sitting on top of a stale
cache is the failure mode that would take days to notice. It requires a `CLOUDFLARE_ZONE_ID`
repository secret and the **Zone → Cache Purge** permission on `CLOUDFLARE_API_TOKEN`.

`/api/*`, `/oauth/*` and `/admin-rejestracje/*` opt out of edge caching explicitly. Those Functions
already return `Cache-Control: no-store`, but the site-wide edge rule outranks it, so each one has
to drop the header with `!` and restate it.

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
they are not part of the regular build. `pnpm validate:content` checks every entry against the
collection schemas and reports *all* failures at once — Astro's build stops at the first.

## Registrations

Course sign-ups run on-site at `/zapisy/`, replacing a Google Form. Course and term options are
rendered from the `courses` collection, so **opening registration for a new edition means editing
the course MDX in the CMS and nothing else.**

```
/zapisy/                        form; options from content collections
  └── POST /api/register        Turnstile → validate slot → D1 insert → 2 emails
      GET  /api/availability    live seat counts
/terminy.json                   build-time slot catalogue (Functions can't call getCollection)
/admin-rejestracje/             review & confirm, behind Cloudflare Access
workers/mailer/                 separate Worker; sends the email
```

**Capacity.** The limit lives in the CMS (`dates[].capacity` → `capacityDefault` → unlimited);
seats taken are `COUNT(*)` of **confirmed** rows in D1. Pending registrations do not hold a seat —
that is the point of the review step. Nothing is ever written back to git.

**Email.** Pages Functions cannot bind `send_email` (Workers ✅ / Pages ❌), so they call
`workers/mailer` through a service binding. A service binding is authorised by the platform, so
there is **no API token** anywhere in this repo or its environment. Deploy it separately:

```bash
npx wrangler deploy --config workers/mailer/wrangler.jsonc
```

**Data protection.** The D1 database is created with `--jurisdiction eu`, pinning storage and
execution to the EU (this cannot be changed after creation). The admin panel verifies a signed
Cloudflare Access JWT rather than trusting the `Cf-Access-Authenticated-User-Email` header, which
is only trustworthy on a path Access actually covers. It fails closed when unconfigured.

### Abuse controls

Anyone can type any address into a public form, so the confirmation e-mail is delivered wherever
the submitter says. Four independent controls keep that from being useful to an attacker:

| Control | Where | Limit |
| --- | --- | --- |
| Turnstile, server-verified | `functions/api/register.js` | single-use token; fails closed without `TURNSTILE_SECRET` |
| Per-address daily cap | `functions/api/register.js` | 3 registrations / e-mail / 24h |
| Global daily circuit breaker | `functions/api/register.js` | past 40 / 24h the row is still stored, but no mail is sent |
| Burst rate limits | `workers/mailer` | 20 sends/min overall, 6/min per recipient |

The strongest control is not a limit: **the attendee e-mail contains no submitted values at all.**
The greeting is impersonal and the transfer title is a template the payer fills in, so the form
cannot be used to deliver attacker-chosen text from this domain to a third party. Submitted data
appears only in the internal notification to `kontakt@` (HTML-escaped) and in the admin panel.

Deliberately *not* rate-limited by IP: many users share one, and the caps above are keyed on
things that actually identify a submission. Add a WAF rate limiting rule on `/api/register` if you
want an IP-level layer as well.

### Configuration

Public values are committed (the Turnstile **site** key is served in the page HTML). Secrets are
Pages secrets — see [`.dev.vars.example`](.dev.vars.example) for the full list:

```bash
npx wrangler pages secret put TURNSTILE_SECRET     --project-name akademia-dermatoskopii
npx wrangler pages secret put ACCESS_TEAM_DOMAIN   --project-name akademia-dermatoskopii
npx wrangler pages secret put ACCESS_AUD           --project-name akademia-dermatoskopii
```

The Access application (**Zero Trust → Access controls → Applications**, self-hosted,
`akademiadermatoskopii.pl/admin-rejestracje`) uses **GitHub** as its identity provider, so editors
sign in with the same account the CMS already requires of them. Two things that are easy to trip
over:

- It needs its **own GitHub OAuth App**. A classic OAuth App allows one callback URL, and the CMS
  app already uses `/oauth/callback`; Access needs
  `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`.
- The policy matches on the **email GitHub reports**, which may be a personal address rather than
  a work one. That same address is written to `confirmed_by` on every registration it approves.

Local development uses Cloudflare's documented Turnstile *test* keys; `/admin-rejestracje/`
returns 403 locally because there is no Access session, which is intended rather than bypassed.

```bash
cp .dev.vars.example .dev.vars
pnpm build && npx wrangler pages dev     # Functions + D1, unlike `pnpm dev`
```
