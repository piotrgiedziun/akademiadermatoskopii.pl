/**
 * The bookable-editions catalogue, derived from the course MDX.
 *
 * Shared by the /terminy.json endpoint (which the runtime Functions read) and
 * the /zapisy/ form (which renders the selects). Both must agree on what is
 * bookable, so the rule lives here once.
 */

import { getAllCourses } from '@/lib/courses';
import { formatDateRange, formatDateRangeNumeric } from '@/lib/dates';

export interface CatalogueSlot {
  key: string;
  courseSlug: string;
  courseTitle: string;
  scheduleLabel: string;
  dateStart: string;
  dateEnd: string | null;
  label: string;
  labelShort: string;
  city: string;
  priceAmount: number;
  priceNotes: string | null;
  capacity: number | null;
  status: string;
  bookable: boolean;
  note: string | null;
}

/** Canonical key for a course edition. Used by every layer. */
export function slotKey(courseSlug: string, dateStart: string): string {
  return `${courseSlug}|${dateStart}`;
}

/** YAML dates parse to UTC midnight; take the calendar date, not the instant. */
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function buildSlotCatalogue(now: Date = new Date()): Promise<CatalogueSlot[]> {
  const courses = await getAllCourses();

  return courses
    .flatMap((course) =>
      course.data.dates
        // Past editions can never be registered for, whatever their status says.
        // Several are still marked `open` in the CMS long after they happened.
        .filter((slot) => slot.start.getTime() >= now.getTime())
        .filter((slot) => slot.status !== 'cancelled')
        .map((slot) => ({
          key: slotKey(course.id, toISODate(slot.start)),
          courseSlug: course.id,
          courseTitle: course.data.title,
          scheduleLabel: course.data.scheduleLabel ?? course.data.title,
          dateStart: toISODate(slot.start),
          dateEnd: slot.end ? toISODate(slot.end) : null,
          label: formatDateRange(slot.start, slot.end),
          labelShort: formatDateRangeNumeric(slot.start, slot.end),
          city: course.data.location.city,
          priceAmount: course.data.price.amount,
          priceNotes: course.data.price.notes ?? null,
          // null = unlimited. Most editions have no explicit limit.
          capacity: slot.capacity ?? course.data.capacityDefault ?? null,
          status: slot.status,
          // Editorial availability. Runtime capacity is layered on top by
          // /api/availability — a slot can be `open` here and still be full.
          bookable: slot.status === 'open' || slot.status === 'filling',
          note: slot.note ?? null,
        })),
    )
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart));
}
