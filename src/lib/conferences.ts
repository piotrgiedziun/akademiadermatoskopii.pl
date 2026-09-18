/**
 * Shared accessors for the konferencje section.
 *
 * getCollection() order is not part of Astro's API — every list needs an
 * explicit sort with a tiebreak (see src/lib/news.ts).
 */

import { getCollection, type CollectionEntry } from 'astro:content';

export type ConferenceEntry = CollectionEntry<'conferences'>;

export const KIND_LABELS = {
  akademia: 'Konferencja AD',
  pgd: 'Kongres PGD',
  combined: 'Konferencja AD · Kongres PGD',
} as const;

/** Newest first; `id` breaks ties so the archive cannot shuffle across builds. */
export function byNewest(a: ConferenceEntry, b: ConferenceEntry): number {
  return b.data.start.getTime() - a.data.start.getTime() || a.id.localeCompare(b.id);
}

/** Soonest first — for picking the featured upcoming edition. */
export function bySoonest(a: ConferenceEntry, b: ConferenceEntry): number {
  return a.data.start.getTime() - b.data.start.getTime() || a.id.localeCompare(b.id);
}

export function isUpcoming(entry: ConferenceEntry, now = new Date()): boolean {
  const last = entry.data.end ?? entry.data.start;
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
  return lastDay.getTime() >= now.getTime();
}

export async function getPublishedConferences(): Promise<ConferenceEntry[]> {
  return (await getCollection('conferences', ({ data }) => !data.draft)).sort(byNewest);
}

export function splitUpcoming(entries: ConferenceEntry[], now = new Date()) {
  const upcoming = entries.filter((e) => isUpcoming(e, now)).sort(bySoonest);
  const past = entries.filter((e) => !isUpcoming(e, now)).sort(byNewest);
  return { upcoming, past, featured: upcoming[0] ?? null };
}
