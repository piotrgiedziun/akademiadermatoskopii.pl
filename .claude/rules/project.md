# Akademia Dermatoskopii — essentials

Astro static site on Cloudflare Pages, plus Pages Functions + D1 for course
registration. Polish-language, one maintainer, ~25 registrations/month. Keep
changes small and boring.

Topic rules live beside this file and load when you open matching files:
`astro.md`, `content.md`, `functions.md`, `d1.md`.

## Hard rules

- **This repository is public.** No credentials, no registrant data. Names, PWZ
  numbers, phones and invoice details exist only in D1 and never in git.
- **Sending email is user-triggered and abusable.** Changes under
  `functions/api/` or `workers/mailer/` must keep the abuse controls intact.
- **Never bypass the pnpm supply-chain cooldown** (`minimumReleaseAge: 10080`
  in `pnpm-workspace.yaml`). If a version is too new to install, take the newest
  one that clears the 7-day window and say which, and when the newer one is due.
- Reuse the existing helpers and services. Do not add a dependency without asking.
- All user-facing text is Polish. Code, comments and commits are English.

## Commands

```bash
pnpm dev                              # Astro only — Pages Functions do NOT run
pnpm build                            # validate:content → astro check → astro build
pnpm build && npx wrangler pages dev  # the only way to exercise Functions + D1
```

## Deploying

Push to `main` runs `.github/workflows/deploy.yml`: build → `pages deploy` →
zone cache purge. The purge is load-bearing (HTML sits at the edge for a week)
and failing it fails the job. `workers/mailer/**` has its own workflow.

D1 migrations are in neither workflow — apply them by hand first (`d1.md`).
