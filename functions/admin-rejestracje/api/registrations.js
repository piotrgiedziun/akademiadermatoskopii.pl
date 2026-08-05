/**
 * GET /admin-rejestracje/api/registrations
 *
 * Query params:
 *   status  pending | confirmed | cancelled   (optional filter)
 *   course  "<courseSlug>"                    (optional filter, all editions)
 *   slot    "<courseSlug>|<dateStart>"        (optional filter, one edition)
 *   sort    created | date                    (default: created)
 *   format  csv                               (export instead of JSON)
 *
 * Access is enforced by ../_middleware.js; this route is never reachable
 * without a verified Access session.
 */

import { loadSlots, availabilityFor } from '../../../src/server/slots.js';

const STATUSES = ['pending', 'confirmed', 'cancelled'];

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
