// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkCmsImages from './src/lib/remark-cms-images.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://akademiadermatoskopii.pl',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  markdown: {
    // Rewrite CMS "/src/assets/…" body image paths to relative so Astro optimizes them.
    remarkPlugins: [remarkCmsImages],
  },
  integrations: [
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'pl',
        locales: { pl: 'pl-PL' },
      },
      filter: (page) => !page.includes('/draft/'),
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
