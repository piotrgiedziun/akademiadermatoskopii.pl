import rss from '@astrojs/rss';
import { getPublishedNews } from '@/lib/news';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/consts';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getPublishedNews();

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
