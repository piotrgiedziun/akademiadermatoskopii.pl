# Akademia Dermatoskopii

Site for **Akademia Dermatoskopii** — courses in dermatoscopy, skin surgery and CO₂ laser, based
in Wrocław, Poland. A static [Astro](https://astro.build/) build with a handful of Cloudflare Pages
Functions for registration, deployed to Cloudflare Pages.

**Production:** https://akademiadermatoskopii.pl

> [!IMPORTANT]
> **This repository is public.** No credentials belong in it. Registrant data — names, PWZ numbers,
> phone numbers, invoice details — lives only in Cloudflare D1 and must never be committed. See
> [Registrations](#registrations).

## Repository map

| Path | What lives there |
| --- | --- |
| `src/pages/` | Routes. Static pages plus `terminy.json.ts`, the build-time slot catalogue |
| `src/content/` | Course, instructor, news and project entries as Markdown/MDX |
| `src/content.config.ts` | Collection schemas. A frontmatter mismatch fails the build |
| `src/lib/` | Build-time helpers — dates, course ordering, slot catalogue |
| `src/server/` | Helpers shared by the Functions (slots, email, field validation) |
| `functions/` | Pages Functions: registration API, admin API, CMS OAuth |
| `workers/mailer/` | Separate Worker that actually sends email |
| `migrations/` | D1 schema, applied with `wrangler d1 migrations apply` |
| `scripts/` | One-off utilities and the content validator. Not part of the build |
| `public/` | Copied to the output root as-is, including `_headers` and `_redirects` |

## Getting started

Requires **Node 22.12+** (see [`.nvmrc`](.nvmrc) — run `nvm use`) and **pnpm**, pinned through the
`packageManager` field. Enable it with `corepack enable`, or install pnpm directly.

```bash
pnpm install
pnpm dev            # http://localhost:4321
pnpm build          # validate content + astro check + build to dist/
pnpm preview        # serve the production build
```

`pnpm dev` does not run the Pages Functions. For anything touching registration, build first and
use Wrangler, which wires up D1 and the local bindings:

```bash
cp .dev.vars.example .dev.vars
pnpm build && npx wrangler pages dev
```

## Content

| Collection | Location | Format |
| --- | --- | --- |
| Courses | `src/content/courses/` | MDX |
| Instructors | `src/content/instructors/` | MDX |
| News | `src/content/news/` | Markdown |
| Projects | `src/content/projects/` | MDX |

Editors work in [Sveltia CMS](https://github.com/sveltia/sveltia-cms) at `/admin/`, which commits
straight to this repository. Site-wide constants — URLs, navigation, social links — are in
[`src/consts.ts`](src/consts.ts).

`pnpm validate:content` checks every entry against the collection schemas and reports *all*
failures at once, where Astro's build stops at the first. It runs as the first step of `pnpm build`.

Two things the CMS makes necessary, both handled rather than worked around:

- Sveltia writes blank optional fields as `""` or `null`, which Zod's `.optional()` does not treat
  as absent. `stripEmpty` in `src/content.config.ts` removes them before validation.
- Its `public_folder` must start with `/`, so uploaded images land in the body as `/src/assets/…`,
  which Astro would emit verbatim as a broken URL. The `remarkCmsImages` plugin rewrites those to
  paths relative to the content file so the image optimizer picks them up.

## Registrations

Course sign-ups run on-site at `/zapisy/`, replacing a Google Form. Course and term options come
from the `courses` collection, so **opening registration for a new edition means editing the course
in the CMS and nothing else.**

```
/zapisy/                          form; options rendered from content collections
  └── POST /api/register          Turnstile → validate slot → D1 insert → 2 emails
      GET  /api/availability      live seat counts
/terminy.json                     build-time slot catalogue
/admin-rejestracje/               review, confirm, edit, export — behind Cloudflare Access
workers/mailer/                   separate Worker; sends the email
```

`/terminy.json` exists because Pages Functions cannot call `getCollection()`. Emitting the
catalogue at build time keeps the course MDX as the single source of truth for both halves. It is
deliberately not under `/api/`, which belongs to the Functions routing tree.

**Capacity.** The limit lives in the CMS (`dates[].capacity` → `capacityDefault` → unlimited);
seats taken are `COUNT(*)` of **confirmed** rows in D1. Pending registrations do not hold a seat —
that is the point of the review step. Nothing is ever written back to git. Because the catalogue is
baked at build time, changing a limit in the CMS takes effect on the next deploy.

**Admin panel.** `/admin-rejestracje/` lists registrations, confirms or cancels them, exports CSV,
and can add and edit entries by hand for people who register by phone. Manual rows are stored with
`source='manual'` and a `+manual` consent version, so they stay distinguishable from anything the
public form accepted. Both write paths share `src/server/registrationFields.js`, so a row typed by
hand cannot hold something the public endpoint would have refused.

**Email.** Pages Functions cannot bind `send_email` (Workers ✅ / Pages ❌), so they call
`workers/mailer` over a service binding. The platform authorises that binding, so there is **no API
token** anywhere in this repository or its environment. Deploy the mailer separately:

```bash
npx wrangler deploy --config workers/mailer/wrangler.jsonc
```

**Data protection.** The D1 database was created with `--jurisdiction eu`, pinning storage and
execution to the EU; this cannot be changed after creation. The admin middleware verifies a signed
Cloudflare Access JWT rather than trusting the `Cf-Access-Authenticated-User-Email` header, which
is only meaningful on a path Access actually covers, and it fails closed when unconfigured.

### Abuse controls

Anyone can type any address into a public form, and the confirmation email is delivered wherever
the submitter says. Four independent controls keep that from being useful to an attacker:

| Control | Where | Limit |
| --- | --- | --- |
| Turnstile, server-verified | `functions/api/register.js` | single-use token; fails closed without `TURNSTILE_SECRET` |
| Per-address daily cap | `functions/api/register.js` | 3 registrations / email / 24h |
| Global daily circuit breaker | `functions/api/register.js` | past 40 / 24h the row is still stored, but no mail is sent |
| Burst rate limits | `workers/mailer` | 20 sends/min overall, 6/min per recipient |

The strongest control is not a limit: **the attendee email contains no submitted values at all.**
The greeting is impersonal and the transfer title is a template the payer fills in, so the form
cannot be used to deliver attacker-chosen text from this domain to a third party. Submitted data
appears only in the internal notification to `kontakt@` (HTML-escaped) and in the admin panel.

Deliberately *not* rate-limited by IP: many users share one, and the caps above key on things that
actually identify a submission. Add a WAF rate limiting rule on `/api/register` for an IP-level
layer as well.

### Configuration

Public values are committed — the Turnstile **site** key is served in the page HTML. Secrets are
Pages secrets; [`.dev.vars.example`](.dev.vars.example) documents the full list and what each one
does.

```bash
npx wrangler pages secret put TURNSTILE_SECRET     --project-name akademia-dermatoskopii
npx wrangler pages secret put ACCESS_TEAM_DOMAIN   --project-name akademia-dermatoskopii
npx wrangler pages secret put ACCESS_AUD           --project-name akademia-dermatoskopii
npx wrangler pages secret put ADMIN_EMAILS         --project-name akademia-dermatoskopii
```

Secrets are read at Worker startup, so a change needs a redeploy before it takes effect.

The Access application (**Zero Trust → Access controls → Applications**, self-hosted,
`akademiadermatoskopii.pl/admin-rejestracje`) uses **GitHub** as its identity provider, so editors
sign in with the account the CMS already requires of them. Two things that are easy to trip over:

- It needs its **own GitHub OAuth App**. A classic OAuth App allows one callback URL and the CMS
  app already uses `/oauth/callback`; Access needs
  `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`.
- The policy matches the **email GitHub reports**, which may be personal rather than work. That
  same address is written to `confirmed_by` on every registration it approves.

Locally, `/admin-rejestracje/` returns 403 because Access cannot issue a session to localhost.
That is the correct behaviour, not something to bypass; `ACCESS_DEV_EMAIL` in `.dev.vars` opens it
for local work and is ignored whenever `ACCESS_TEAM_DOMAIN` is set.

## Deployment

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): build,
`wrangler pages deploy`, then a zone cache purge. `workers/mailer` deploys separately via
[`deploy-mailer.yml`](.github/workflows/deploy-mailer.yml).

Database changes are not part of that workflow. Apply them first, and only in a direction the
running code tolerates:

```bash
npx wrangler d1 migrations apply akademia-rejestracje --remote
```

### Caching

HTML sits at the Cloudflare edge for a week via `Cloudflare-CDN-Cache-Control`. That header
outranks the `max-age=0, must-revalidate` Pages sends, and Cloudflare strips it before the response
reaches the browser, so visitors still revalidate on every navigation and never hold stale markup
themselves. Pages does send an `ETag`, but the zone's Email Address Obfuscation rewrites the HTML
body at the edge, so the validator is dropped and no revalidation can come back as a cheap `304`.
The TTL is the only thing keeping page bodies off the origin.

A week-long TTL is safe only because **the deploy workflow purges the zone after every production
deploy**. That step fails the job when the purge fails: a green deploy sitting on top of a stale
cache is the failure mode that would take days to notice. It needs a `CLOUDFLARE_ZONE_ID`
repository secret and the **Zone → Cache Purge** permission on `CLOUDFLARE_API_TOKEN`.

`/api/*`, `/oauth/*` and `/admin-rejestracje/*` opt out of edge caching explicitly. Those Functions
already return `Cache-Control: no-store`, but the site-wide edge rule outranks it, so each one has
to drop the header with `!` and restate it in [`public/_headers`](public/_headers).
