/**
 * Shared constants and accessors for the aktualności (news) section.
 */

import { getCollection, type CollectionEntry } from 'astro:content';

export const NEWS_PAGE_SIZE = 12;

type NewsEntry = CollectionEntry<'news'>;

/**
 * Newest first, with an explicit tiebreak.
 *
 * 23 dates in the collection carry more than one post — the WordPress import
 * kept only the day, not the time. Sorting on `publishedAt` alone leaves those
 * groups tied, and a tie falls back to whatever order getCollection() happens
 * to return. That order is not part of Astro's API: the Astro 7 upgrade
 * changed it, silently swapping two posts from 2023-06-26 in the RSS feed, on
 * /aktualnosci/ and on every paginated page after it.
 *
 * A reordered feed is republished to subscribers as if it were new, so the
 * tiebreak belongs in the sort rather than in the loader's iteration order.
 * Ascending `id` is what 22 of those 23 groups were already being served in,
 * so fixing the rule leaves the site as it was apart from that one pair.
 */
export function byNewest(a: NewsEntry, b: NewsEntry): number {
  return (
    b.data.publishedAt.getTime() - a.data.publishedAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/** Every published (non-draft) post, newest first. */
export async function getPublishedNews(): Promise<NewsEntry[]> {
  return (await getCollection('news', ({ data }) => !data.draft)).sort(byNewest);
}
