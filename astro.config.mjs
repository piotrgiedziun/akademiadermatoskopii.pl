// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkCmsImages from './src/lib/remark-cms-images.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://akademiadermatoskopii.pl',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Astro 7 defaults this to 'jsx', which strips whitespace between inline
  // elements the way React does. Every page here was authored against the old
  // rule, so keep it — the bytes saved are not worth auditing 344 pages.
  compressHTML: true,
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  markdown: {
    // Astro 7 renders Markdown with Sätteri; remark plugins need the old unified
    // pipeline, which is now an opt-in package. remarkCmsImages rewrites CMS
    // "/src/assets/…" body image paths to relative so Astro optimizes them.
    processor: unified({ remarkPlugins: [remarkCmsImages] }),
  },
  integrations: [
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'pl',
        locales: { pl: 'pl-PL' },
      },
      // /admin-rejestracje/ is Access-protected and /zapisy/dziekujemy/ is a
      // post-submit page — neither belongs in search results.
      filter: (page) =>
        !page.includes('/draft/') &&
        !page.includes('/admin-rejestracje/') &&
        !page.includes('/zapisy/dziekujemy/'),
      changefreq: 'weekly',
      priority: 0.7,
    }),
  ],
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  vite: {
    build: {
      cssCodeSplit: true,
    },
  },
});
