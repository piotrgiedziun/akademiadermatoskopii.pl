/**
 * Course query helpers — used by /kursy/ catalog and the <UpcomingCoursesFilter> island.
 */

import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';

export type Course = CollectionEntry<'courses'>;
export type CourseCategory = Course['data']['category'];
export type CourseLevel = Course['data']['level'];
export type CourseStatus = 'open' | 'filling' | 'sold-out' | 'cancelled';

export interface CourseFilters {
  category?: CourseCategory;
  level?: CourseLevel;
  onlyUpcoming?: boolean;
}

/** Fetch all non-draft courses. */
export async function getAllCourses(): Promise<Course[]> {
  const all = await getCollection('courses');
  return all.filter((c) => !c.data.draft);
}

/**
 * Canonical editorial course order, shared by the /kursy catalog and the homepage
 * "Wybrane kursy" section so the two never drift: foundational → advanced →
 * specialist → adjacent disciplines → newest.
 */
export const COURSE_ORDER = [
  'dermatoskopia-podstawowa',
  'dermatoskopia-zaawansowana',
  'trudne-lokalizacje',
  'chirurgia-skory',
  'pisanie-prac-naukowych',
  'laser-co2',
] as const;

/** Sort courses by COURSE_ORDER; any slug not listed sorts last (then alphabetically). */
export function orderByCatalog(courses: Course[]): Course[] {
  const rank = (id: string) => {
    const i = COURSE_ORDER.indexOf(id as (typeof COURSE_ORDER)[number]);
    return i === -1 ? COURSE_ORDER.length : i;
  };
  return [...courses].sort(
    (a, b) => rank(a.id) - rank(b.id) || a.data.title.localeCompare(b.data.title, 'pl'),
  );
}

/** Next upcoming date for a course (first start >= now). Null if no upcoming. */
export function nextUpcomingDate(course: Course, now: Date = new Date()): Date | null {
  const upcoming = course.data.dates
    .filter((d) => d.start.getTime() >= now.getTime())
    .map((d) => d.start)
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

/** Any upcoming slot still bookable (open or filling). */
export function hasBookableUpcoming(course: Course, now: Date = new Date()): boolean {
  return course.data.dates.some(
    (d) =>
      d.start.getTime() >= now.getTime() &&
      (d.status === 'open' || d.status === 'filling'),
  );
}

/**
 * TODO(learning-mode B): implement the canonical catalog ranking.
 *
 * Trade-offs to consider:
 *   1. Should courses with zero upcoming dates still appear on /kursy/?
 *      (Argument for: educational catalog; argument against: wasted slots)
 *   2. Should sold-out-upcoming courses sink below open ones, or stay prominent
 *      as social proof? ("so popular they sold out")
 *   3. Tie-break: `featured` first, or nearest-date first, or alphabetical?
 *
 * This function is consumed by:
 *   - src/pages/kursy/index.astro (server-side, initial render)
 *   - src/components/content/UpcomingCoursesFilter.astro (client island)
 *
 * Safe default below — keep it working; refine to match your editorial call.
 */
export function filterAndRankCourses(
  courses: Course[],
  filters: CourseFilters = {},
  now: Date = new Date(),
): Course[] {
  let filtered = courses;

  if (filters.category) {
    filtered = filtered.filter((c) => c.data.category === filters.category);
  }
  if (filters.level && filters.level !== 'all') {
    filtered = filtered.filter(
      (c) => c.data.level === filters.level || c.data.level === 'all',
    );
  }
  if (filters.onlyUpcoming) {
    filtered = filtered.filter((c) => nextUpcomingDate(c, now) !== null);
  }

  return filtered.sort((a, b) => {
    // Featured courses first
    if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
    // Then by nearest upcoming date
    const aNext = nextUpcomingDate(a, now);
    const bNext = nextUpcomingDate(b, now);
    if (aNext && !bNext) return -1;
    if (!aNext && bNext) return 1;
    if (aNext && bNext) return aNext.getTime() - bNext.getTime();
    // Final tie-break: manual order, then title
    return a.data.order - b.data.order || a.data.title.localeCompare(b.data.title, 'pl');
  });
}

/** Upcoming dates across all courses, flattened + sorted. */
export async function getUpcomingDates(limit = 8, now: Date = new Date()) {
  const all = await getAllCourses();
  const flat = all.flatMap((c) =>
    c.data.dates
      .filter((d) => d.start.getTime() >= now.getTime())
      .map((d) => ({ course: c, slot: d })),
  );
  flat.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  return flat.slice(0, limit);
}

/** Price range across all courses — for the pricing summary. */
export function priceRange(courses: Course[]) {
  const prices = courses.map((c) => c.data.price.amount);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export const CATEGORY_LABELS: Record<CourseCategory, string> = {
  dermatoskopia: 'Dermatoskopia',
  chirurgia: 'Chirurgia skóry',
  laser: 'Laseroterapia',
  nauka: 'Nauka i badania',
  inne: 'Inne',
};

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  basic: 'Podstawowy',
  intermediate: 'Średniozaawansowany',
  advanced: 'Zaawansowany',
  all: 'Każdy poziom',
};
