---
paths:
  - "functions/**"
  - "src/server/**"
  - "workers/**"
  - "public/_headers"
  - "wrangler.jsonc"
---

# Pages Functions, Access & email

Plain JS with JSDoc — `functions/` is outside tsconfig. Export named
`onRequestGet` / `onRequestPost`, destructure `env` from the context, return
`Cache-Control: no-store`. Shared logic lives in `src/server/*.js` and is
imported by relative path (esbuild bundles it); `/zapisy/` imports the same
files at build time, so keep them free of runtime-only globals.

## Platform constraints

- Functions cannot call `getCollection()`. Course data reaches them only via
  `/terminy.json` (`loadSlots()`, preferring the `ASSETS` binding).
- Pages cannot bind `send_email` (Workers ✅ / Pages ❌). That is the entire
  reason `workers/mailer` exists, reached over the `MAILER` service binding —
  authorised by the platform, so there is no API token anywhere. It deploys
  separately; under `wrangler pages dev` the binding is absent, mail fails and
  is logged, and the D1 row is still written by design.
- Secrets are read at Worker startup: changing one needs a redeploy.

## Abuse controls — do not weaken

Turnstile fails closed without `TURNSTILE_SECRET`; 3 registrations per email
per 24h; a global circuit breaker at 40/24h that still stores the row but sends
no mail (keep it ≤48 — 2 mails × cap × 31 must stay under the 3,000/month
included); mailer rate limits 20/min global and 6/min per recipient; sender
restricted to `zapisy@`.

**The attendee email contains no submitted values at all.** That is what stops
the form delivering attacker-chosen text from this domain. Keep it that way;
submitted data appears only in the internal `kontakt@` notification, escaped.

## Admin

`/admin-rejestracje/*` is a separate Cloudflare Access application from
`/admin/` (Sveltia). `_middleware.js` verifies a *signed* Access JWT via
`src/server/access.js` and fails closed — never trust the
`Cf-Access-Authenticated-User-Email` header on its own. `ADMIN_EMAILS` is a
second gate after the JWT. Both write paths share
`src/server/registrationFields.js` so a hand-typed row cannot hold something
the public endpoint would have refused.

## public/_headers

Cloudflare **intersects** CSP headers rather than replacing them, so a
path-scoped policy must first drop the site-wide one with
`! Content-Security-Policy` and restate it in full. Same for
`! Cloudflare-CDN-Cache-Control` on the `no-store` paths — the site-wide
week-long edge TTL otherwise outranks the Function's own header and caches
registrant data. Limits: 100 rules, 2,000 characters per header.
