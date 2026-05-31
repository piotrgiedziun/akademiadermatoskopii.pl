import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/consts';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('news', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
  );

  return rss({
    title: `${SITE_NAME} — Aktualności`,
    description: SITE_DESCRIPTION,
    site: context.site ?? SITE_URL,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.summary,
      pubDate: p.data.publishedAt,
      link: `/aktualnosci/${p.id}/`,
    })),
    customData: '<language>pl-PL</language>',
  });
}
