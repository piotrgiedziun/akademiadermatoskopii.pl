/**
 * PATCH  /admin-rejestracje/api/<id>   — edit a registration
 * DELETE /admin-rejestracje/api/<id>   — remove it permanently
 *
 * PATCH body: any subset of
 *   status, notes, fullName, titlePrefix, pwz, email, phone, invoiceData,
 *   priceAmount, courseSlug + dateStart, force
 *
 * Only keys actually present in the body are written, so the panel can send a
 * single field without blanking the rest of the row.
 *
 * Confirming is what makes a registration count against the course capacity,
 * so this is the review step the whole flow is built around. Access is enforced
 * by ../_middleware.js.
 */

import { loadSlots, findSlot, availabilityFor } from '../../../src/server/slots.js';
import { clean, isEmail, MAX } from '../../../src/server/registrationFields.js';

const STATUSES = ['pending', 'confirmed', 'cancelled'];

/**
 * Free-text columns the panel may edit, as [body key, column, max length].
 *
 * `full_name` is NOT NULL and is handled apart from these — for every other
 * column an empty string means "cleared" and is stored as NULL, so the CSV and
 * the table show '—' rather than a blank that reads like a rendering bug.
 */
const TEXT_FIELDS = [
  ['titlePrefix', 'title_prefix', MAX.title],
  ['pwz', 'pwz', MAX.pwz],
  ['phone', 'phone', MAX.phone],
  ['invoiceData', 'invoice_data', MAX.invoice],
  ['notes', 'notes', MAX.notes],
];

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

  for (const [key, column, max] of TEXT_FIELDS) {
    if (typeof body[key] !== 'string') continue;
    updates.push(`${column} = ?`);
    binds.push(clean(body[key], max) || null);
  }

  if (typeof body.fullName === 'string') {
    const fullName = clean(body.fullName, MAX.name);
    if (!fullName) return fail('Podaj imię i nazwisko.');
    updates.push('full_name = ?');
    binds.push(fullName);
  }

  if (typeof body.email === 'string') {
    const email = clean(body.email, MAX.email).toLowerCase();
    if (!isEmail(email)) return fail('Podaj poprawny adres e-mail.');
    updates.push('email = ?');
    binds.push(email);
  }

  if (body.priceAmount !== undefined) {
    const price = Number(body.priceAmount);
    if (!Number.isFinite(price) || price < 0) return fail('Nieprawidłowa cena.');
    updates.push('price_amount = ?');
    binds.push(Math.round(price));
  }

  // Moving someone to another edition. Both halves are required together — a
  // slug without a date would silently point at an edition that doesn't exist.
  let nextCourse = row.course_slug;
  let nextDate = row.date_start;
  const movingTerm = body.courseSlug !== undefined || body.dateStart !== undefined;
  if (movingTerm) {
    nextCourse = clean(body.courseSlug, MAX.slug);
    nextDate = clean(body.dateStart, MAX.date);
    if (!nextCourse || !nextDate) return fail('Wybierz kurs i termin.');
  }
  const termChanged = nextCourse !== row.course_slug || nextDate !== row.date_start;

  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return fail('Nieprawidłowy status.');
  }
  const nextStatus = body.status ?? row.status;

  // Capacity is only re-checked when the row would newly occupy a seat in a
  // given edition: on confirming, or on moving an already-confirmed row. Editing
  // a phone number on a confirmed entry must not trip a limit it already holds.
  const takesNewSeat = nextStatus === 'confirmed' && (row.status !== 'confirmed' || termChanged);
  if (takesNewSeat) {
    try {
      const slots = await loadSlots(context);
      const slot = findSlot(slots, nextCourse, nextDate);
      if (movingTerm && !slot) {
        return fail('Nie znaleziono takiego terminu.', 404);
      }
      if (slot) {
        const { results } = await env.DB.prepare(
          `SELECT COUNT(*) AS taken FROM registrations
            WHERE course_slug = ? AND date_start = ? AND status = 'confirmed' AND id != ?`,
        )
          .bind(nextCourse, nextDate, id)
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

  if (termChanged) {
    updates.push('course_slug = ?', 'date_start = ?');
    binds.push(nextCourse, nextDate);
  }

  if (body.status !== undefined) {
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

/**
 * Permanent removal — for a mistyped manual entry, and for a RODO erasure
 * request, which cancelling cannot satisfy because the row's personal data
 * would still be there.
 *
 * The panel asks the admin to type the surname before this is called; that
 * guard is deliberately in the UI, where the person and the name are both in
 * front of them. Here it is logged instead, because a delete leaves no other
 * trace: the row it describes is gone.
 */
export async function onRequestDelete(context) {
  const { env, params, data } = context;
  const id = params.id;

  const row = await env.DB.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  if (!row) return fail('Nie znaleziono zgłoszenia.', 404);

  await env.DB.prepare('DELETE FROM registrations WHERE id = ?').bind(id).run();

  // No name or address here — the audit trail must not become a second copy of
  // the data the deletion was meant to remove.
  console.log(
    `registration deleted: id=${id} course=${row.course_slug} date=${row.date_start} ` +
      `status=${row.status} by=${data.adminEmail ?? 'unknown'}`,
  );

  return Response.json({ deleted: id }, { headers: { 'Cache-Control': 'no-store' } });
}
