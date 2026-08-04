/**
 * PATCH /admin-rejestracje/api/<id>
 *
 * Body: { status?: 'pending'|'confirmed'|'cancelled', notes?: string }
 *
 * Confirming is what makes a registration count against the course capacity,
 * so this is the review step the whole flow is built around. Access is enforced
 * by ../_middleware.js.
 */

import { loadSlots, findSlot, availabilityFor } from '../../../src/server/slots.js';

const STATUSES = ['pending', 'confirmed', 'cancelled'];

function fail(message, status = 400, extra = {}) {
  return Response.json({ error: message, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequestPatch(context) {
  const { request, env, params, data } = context;
  const id = params.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail('Nieprawidłowe dane.');
  }

  const row = await env.DB.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  if (!row) return fail('Nie znaleziono zgłoszenia.', 404);

  const updates = [];
  const binds = [];

  if (typeof body.notes === 'string') {
    updates.push('notes = ?');
    binds.push(body.notes.trim().slice(0, 2000) || null);
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return fail('Nieprawidłowy status.');

    // Confirming takes a seat, so it has to respect the limit. Without this the
    // panel could overbook a course that the public form correctly refuses.
    if (body.status === 'confirmed' && row.status !== 'confirmed') {
      try {
        const slots = await loadSlots(context);
        const slot = findSlot(slots, row.course_slug, row.date_start);
        if (slot) {
          const { results } = await env.DB.prepare(
            `SELECT COUNT(*) AS taken FROM registrations
              WHERE course_slug = ? AND date_start = ? AND status = 'confirmed'`,
          )
            .bind(row.course_slug, row.date_start)
            .all();
          const avail = availabilityFor(slot, results[0]?.taken ?? 0);
          if (avail.full && !body.force) {
            return fail(
              `Termin jest pełny (${avail.taken}/${avail.capacity}). Zwiększ limit w CMS lub potwierdź mimo to.`,
              409,
              { full: true, ...avail },
            );
          }
        }
      } catch (err) {
        // A missing catalogue must not block an admin from doing their job.
        console.error('capacity check skipped:', err.message);
      }
    }

    updates.push('status = ?');
    binds.push(body.status);

    if (body.status === 'confirmed') {
      updates.push('confirmed_at = ?', 'confirmed_by = ?');
      binds.push(new Date().toISOString(), data.adminEmail ?? 'unknown');
    } else {
      // Un-confirming releases the seat; the audit fields would otherwise lie.
      updates.push('confirmed_at = NULL', 'confirmed_by = NULL');
    }
  }

  if (!updates.length) return fail('Brak zmian.');

  binds.push(id);
  await env.DB.prepare(`UPDATE registrations SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  return Response.json({ registration: updated }, { headers: { 'Cache-Control': 'no-store' } });
}
