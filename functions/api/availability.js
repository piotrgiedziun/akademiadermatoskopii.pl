/**
 * GET /api/availability
 *
 * Live seat counts for every upcoming edition, so the static /zapisy/ page can
 * grey out full slots without being rebuilt. Advisory only — register.js
 * re-checks before writing, because this response is a snapshot the client
 * could be holding for a while.
 */

import { loadSlots, countConfirmed, availabilityFor } from '../../src/server/slots.js';

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const [slots, counts] = await Promise.all([loadSlots(context), countConfirmed(env.DB)]);

    const availability = {};
    for (const slot of slots) {
      availability[slot.key] = availabilityFor(slot, counts.get(slot.key) ?? 0);
    }

    return Response.json(
      { availability },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('availability failed:', err.message);
    // The form degrades gracefully: without counts it shows every CMS-open slot
    // and lets register.js reject anything that is actually full.
    return Response.json(
      { availability: {}, degraded: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
