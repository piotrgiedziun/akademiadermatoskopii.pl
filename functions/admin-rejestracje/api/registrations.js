/**
 * GET  /admin-rejestracje/api/registrations   — list / CSV export
 * POST /admin-rejestracje/api/registrations   — add an entry by hand
 *
 * GET query params:
 *   status  pending | confirmed | cancelled   (optional filter)
 *   course  "<courseSlug>"                    (optional filter, all editions)
 *   slot    "<courseSlug>|<dateStart>"        (optional filter, one edition)
 *   sort    created | date                    (default: created)
 *   format  csv                               (export instead of JSON)
 *
 * Access is enforced by ../_middleware.js; this route is never reachable
 * without a verified Access session.
 */

import { loadSlots, findSlot, availabilityFor } from '../../../src/server/slots.js';
import { participantFields, clean, MAX } from '../../../src/server/registrationFields.js';
import { CONSENT_VERSION } from '../../../src/server/consent.js';
import { sendEmail, logoAttachment, attendeeEmail, transferTitle } from '../../../src/server/email.js';

const STATUSES = ['pending', 'confirmed', 'cancelled'];

/**
 * Consent marker for rows an admin typed in.
 *
 * The public form records a ticked checkbox; here a person states that consent
 * was given on the phone. Both are valid, but an audit has to be able to tell
 * them apart, so the version carries the channel rather than pretending the
 * checkbox was clicked.
 */
const MANUAL_CONSENT_VERSION = `${CONSENT_VERSION}+manual`;

function fail(message, status = 400, extra = {}) {
  return Response.json({ error: message, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Allowed sort orders, keyed by the `sort` param.
 *
 * ORDER BY cannot be parameterised, so these clauses are looked up by key and
 * never built from the query string — an unknown key falls back to the default
 * rather than reaching SQL.
 *
 * created_at is an ISO string, so sorting it lexicographically is chronological.
 * `id` only breaks ties between rows sharing a timestamp: arbitrary but
 * deterministic, which keeps the order stable across reloads.
 */
const SORTS = {
  // The review queue: newest submission first. Served by idx_reg_created.
  created: 'created_at DESC, id DESC',
  // By course edition, soonest first — the next course to run is the one that
  // needs attention. Newest signup first within each edition.
  date: 'date_start ASC, created_at DESC, id DESC',
};
const DEFAULT_SORT = 'created';

const CSV_COLUMNS = [
  ['created_at', 'Data zgłoszenia'],
  ['status', 'Status'],
  ['course_slug', 'Kurs'],
  ['date_start', 'Termin'],
  ['title_prefix', 'Tytuł'],
  ['full_name', 'Imię i nazwisko'],
  ['pwz', 'PWZ'],
  ['email', 'E-mail'],
  ['phone', 'Telefon'],
  ['invoice_data', 'Dane do faktury'],
  ['price_amount', 'Cena'],
  ['notes', 'Notatki'],
  ['confirmed_at', 'Potwierdzono'],
  ['confirmed_by', 'Potwierdził'],
  ['source', 'Źródło'],
];

function toCsv(rows) {
  // Excel opens UTF-8 CSV as Latin-1 without a BOM, which mangles every Polish
  // name in the file. Semicolons for the same reason: pl-PL Excel splits on ';'.
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.map(([, label]) => esc(label)).join(';')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map(([key]) => esc(row[key])).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const status = url.searchParams.get('status');
  const course = url.searchParams.get('course');
  const slot = url.searchParams.get('slot');
  const sort = url.searchParams.get('sort');

  const where = [];
  const binds = [];
  if (status && STATUSES.includes(status)) {
    where.push('status = ?');
    binds.push(status);
  }
  // `course` covers every edition; `slot` narrows to one. Both are bound as
  // parameters, so an unknown slug simply matches nothing.
  if (course) {
    where.push('course_slug = ?');
    binds.push(course);
  }
  if (slot && slot.includes('|')) {
    const [courseSlug, dateStart] = slot.split('|');
    where.push('course_slug = ? AND date_start = ?');
    binds.push(courseSlug, dateStart);
  }

  const orderBy = SORTS[sort] ?? SORTS[DEFAULT_SORT];

  const sql =
    `SELECT * FROM registrations` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${orderBy}`;

  const { results } = await env.DB.prepare(sql).bind(...binds).all();

  if (url.searchParams.get('format') === 'csv') {
    const stamp = new Date().toISOString().slice(0, 10);
    // The slug reaches a response header, so it is whitelisted rather than
    // escaped — anything outside [a-z0-9-] is dropped instead of trusted.
    const tag = course && /^[a-z0-9-]+$/.test(course) ? `-${course}` : '';
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="rejestracje${tag}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Options for the course filter. Deliberately unfiltered — the dropdown must
  // keep offering every course even while one of them is selected. Sourced from
  // the registrations rather than the slot catalogue, which only lists future
  // bookable editions and would drop any course whose dates have all passed.
  const { results: courseRows } = await env.DB.prepare(
    `SELECT course_slug, COUNT(*) AS total FROM registrations GROUP BY course_slug`,
  ).all();

  // Slot summary so the panel can show "10 / 10" per edition without the client
  // recomputing it from the rows (which would miss editions with zero signups).
  let slotSummary = [];
  let titles = new Map();
  try {
    const slots = await loadSlots(context);
    titles = new Map(slots.map((s) => [s.courseSlug, s.courseTitle]));
    // Counted from the DB, not from `results` — under a status/slot filter the
    // returned rows are a subset and would under-report every other edition.
    const { results: allCounts } = await env.DB.prepare(
      `SELECT course_slug, date_start, COUNT(*) AS taken
         FROM registrations WHERE status = 'confirmed'
        GROUP BY course_slug, date_start`,
    ).all();
    const taken = new Map(allCounts.map((r) => [`${r.course_slug}|${r.date_start}`, r.taken]));

    slotSummary = slots.map((s) => ({
      key: s.key,
      courseSlug: s.courseSlug,
      courseTitle: s.courseTitle,
      label: s.label,
      dateStart: s.dateStart,
      // Prefills the price on the manual-entry form, and lets the panel show
      // what an override is departing from.
      priceAmount: s.priceAmount,
      bookable: s.bookable,
      ...availabilityFor(s, taken.get(s.key) ?? 0),
    }));
  } catch (err) {
    console.error('slot summary unavailable:', err.message);
  }

  // Title from the catalogue where the course still has a future edition;
  // otherwise the slug, which is readable enough to pick from a list.
  const courses = courseRows
    .map((r) => ({
      slug: r.course_slug,
      title: titles.get(r.course_slug) ?? r.course_slug,
      total: r.total,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'pl'));

  return Response.json(
    {
      registrations: results,
      slots: slotSummary,
      courses,
      adminEmail: context.data.adminEmail,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Add a registration that never went through the form — a phone call, an
 * e-mail, someone signing up at the desk.
 *
 * Body: { courseSlug, dateStart, fullName, email, phone?, pwz?, titlePrefix?,
 *         invoiceData?, notes?, priceAmount?, status?, force? }
 *
 * The attendee always gets the same confirmation e-mail the site sends: it
 * carries the bank details and the transfer title, which is the one thing the
 * caller cannot be given reliably over the phone.
 */
export async function onRequestPost(context) {
  const { request, env, data, waitUntil } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return fail('Nieprawidłowe dane.');
  }

  const { fields, error } = participantFields(payload);
  if (error) return fail(error);
  const { fullName, email, phone, pwz, titlePrefix, invoiceData, courseSlug, dateStart } = fields;

  const status = STATUSES.includes(payload.status) ? payload.status : 'pending';
  const notes = clean(payload.notes, MAX.notes);

  // The catalogue is the only place the price and the course title live, so the
  // edition has to be in it. Unlike the public path, `bookable` is NOT required:
  // a phone call is exactly how someone gets onto a course marked sold-out.
  let slots;
  try {
    slots = await loadSlots(context);
  } catch (err) {
    console.error('slot catalogue unavailable:', err.message);
    return fail('Katalog terminów jest chwilowo niedostępny. Spróbuj ponownie.', 503);
  }

  const slot = findSlot(slots, courseSlug, dateStart);
  if (!slot) {
    return fail(
      'Nie znaleziono takiego terminu. Panel obsługuje tylko przyszłe, nieodwołane edycje.',
      404,
    );
  }

  // Price defaults to the edition's but stays overridable — an agreed rate or a
  // discount is a normal part of a booking made over the phone.
  const override = Number(payload.priceAmount);
  const priceAmount =
    Number.isFinite(override) && override >= 0 ? Math.round(override) : slot.priceAmount;

  // The same two guards the public path enforces, but advisory here: an admin
  // can see the situation the form cannot, so both are overridable with `force`.
  const dupe = await env.DB.prepare(
    `SELECT id FROM registrations
      WHERE email = ? AND course_slug = ? AND date_start = ? AND status != 'cancelled'
      LIMIT 1`,
  )
    .bind(email, courseSlug, dateStart)
    .first();
  if (dupe && !payload.force) {
    return fail('Ten adres e-mail ma już zgłoszenie na ten termin.', 409, { duplicate: true });
  }

  if (status === 'confirmed') {
    const { results } = await env.DB.prepare(
      `SELECT COUNT(*) AS taken FROM registrations
        WHERE course_slug = ? AND date_start = ? AND status = 'confirmed'`,
    )
      .bind(courseSlug, dateStart)
      .all();
    const avail = availabilityFor(slot, results[0]?.taken ?? 0);
    if (avail.full && !payload.force) {
      return fail(`Termin jest pełny (${avail.taken}/${avail.capacity}).`, 409, {
        full: true,
        ...avail,
      });
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO registrations
       (id, created_at, course_slug, date_start, status, full_name, title_prefix, pwz,
        email, phone, invoice_data, price_amount, consent_at, consent_version, notes,
        confirmed_at, confirmed_by, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
  )
    .bind(
      id, now, courseSlug, dateStart, status, fullName, titlePrefix || null, pwz || null,
      email, phone || null, invoiceData || null, priceAmount, now, MANUAL_CONSENT_VERSION,
      notes || null,
      status === 'confirmed' ? now : null,
      status === 'confirmed' ? (data.adminEmail ?? 'unknown') : null,
    )
    .run();

  const dateLabel = `${slot.label}${slot.city ? ', ' + slot.city : ''}`;
  const notify = async () => {
    // Every manual entry gets the bank details — except one entered straight as
    // cancelled, which is a correction being recorded, not a booking.
    if (status === 'cancelled') return;
    const logo = await logoAttachment(context);
    try {
      await sendEmail(env, {
        to: email,
        ...attendeeEmail({
          courseTitle: slot.courseTitle,
          dateLabel,
          priceAmount,
          hasLogo: Boolean(logo),
        }),
        attachments: logo ? [logo] : undefined,
      });
    } catch (err) {
      // The row is already stored — a failed e-mail must never undo it.
      console.error('manual registration email failed:', err.message);
    }
  };
  if (waitUntil) waitUntil(notify());
  else await notify();

  const row = await env.DB.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  return Response.json(
    { registration: row, transferTitle: transferTitle(dateLabel) },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
