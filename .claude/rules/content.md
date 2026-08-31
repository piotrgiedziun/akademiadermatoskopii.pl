---
paths:
  - "src/content/**"
  - "src/content.config.ts"
  - "public/admin/**"
  - "src/lib/slotCatalogue.ts"
---

# Content & Sveltia CMS

Editors work in Sveltia CMS at `/admin/`, which commits straight to `main`.
Assume every field is edited by a non-developer: the collection schema is the
only guard, and a bad value fails the production build.

- Run `pnpm validate:content` after touching content or the schema. It reports
  every failure at once; `astro build` stops at the first.
- A schema change needs the matching widget in `public/admin/config.yml`, or
  the CMS writes frontmatter that cannot pass validation.
- Sveltia writes blank optional fields as `""` or `null`. `stripEmpty` in
  `src/content.config.ts` removes them before Zod runs, so a new optional field
  needs no `.or(z.literal(''))` of its own.
- `public_folder` must start with `/`, so uploads land in the body as
  `/src/assets/news/…`. `remarkCmsImages` (body) and `HeroImage` (frontmatter)
  resolve that back to an import — do not "fix" the path in the CMS config.
- The CMS bundle is vendored at `public/admin/sveltia-cms.js`; update it with
  `bash scripts/update-cms.sh`, never by adding a CDN script tag.

## Courses drive registration

`courses` is the single source of truth for `/zapisy/`: `dates[]` with
`status`, and `capacity ?? capacityDefault ?? null` (null = unlimited). Opening
a new edition means editing the course in the CMS and nothing else.

The catalogue (`src/lib/slotCatalogue.ts` → `/terminy.json`) is built at build
time, so **a capacity or status change only takes effect on the next deploy.**
Past dates are filtered out whatever their status says.
