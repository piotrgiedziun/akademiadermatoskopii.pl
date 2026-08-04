/**
 * Slot lookup + capacity resolution for the registration Functions.
 *
 * The catalogue itself is built by src/pages/terminy.json.ts from the course
 * MDX. Nothing here duplicates course data — it only reads it.
 */

/** Canonical key for a course edition. Must match src/pages/terminy.json.ts. */
export function slotKey(courseSlug, dateStart) {
  return `${courseSlug}|${dateStart}`;
}

/**
 * Read the build-time slot catalogue.
 *
 * Prefers the ASSETS binding (no network hop, correct on preview deployments);
 * falls back to a same-origin fetch when running somewhere without it.
 */
export async function loadSlots(context) {
  const { env, request } = context;
  const url = new URL('/terminy.json', request.url);

  const res = env?.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
  if (!res.ok) {
    throw new Error(`Nie udało się wczytać katalogu terminów (HTTP ${res.status})`);
  }

  const { slots } = await res.json();
  return slots;
}

/** Find one slot by course slug + ISO start date. Null when it doesn't exist. */
export function findSlot(slots, courseSlug, dateStart) {
  const key = slotKey(courseSlug, dateStart);
  return slots.find((s) => s.key === key) ?? null;
}

/**
 * Seats taken per slot, counting confirmed registrations only.
 *
 * Pending entries deliberately do not hold a seat: an unreviewed registration
 * could be a duplicate or a no-show, and letting those block a course was the
 * whole reason for the review step.
 */
export async function countConfirmed(db) {
  const { results } = await db
    .prepare(
      `SELECT course_slug, date_start, COUNT(*) AS taken
         FROM registrations
        WHERE status = 'confirmed'
        GROUP BY course_slug, date_start`,
    )
    .all();

  const counts = new Map();
  for (const row of results) {
    counts.set(slotKey(row.course_slug, row.date_start), row.taken);
  }
  return counts;
}

/**
 * Merge editorial availability (CMS) with runtime occupancy (D1).
 *
 * `capacity: null` means unlimited — most editions have no explicit limit, and
 * an unset limit must never be read as zero.
 */
export function availabilityFor(slot, taken) {
  const capacity = slot.capacity ?? null;
  const full = capacity !== null && taken >= capacity;
  return {
    capacity,
    taken,
    remaining: capacity === null ? null : Math.max(0, capacity - taken),
    full,
    // A slot is only registrable if the CMS says so AND there is room.
    available: slot.bookable && !full,
  };
}
