/**
 * GET /admin-rejestracje/api/registrations
 *
 * Query params:
 *   status  pending | confirmed | cancelled   (optional filter)
 *   slot    "<courseSlug>|<dateStart>"        (optional filter)
 *   format  csv                               (export instead of JSON)
 *
 * Access is enforced by ../_middleware.js; this route is never reachable
 * without a verified Access session.
 */

import { loadSlots, availabilityFor } from '../../../src/server/slots.js';

const STATUSES = ['pending', 'confirmed', 'cancelled'];

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
  const slot = url.searchParams.get('slot');

  const where = [];
  const binds = [];
  if (status && STATUSES.includes(status)) {
    where.push('status = ?');
    binds.push(status);
  }
  if (slot && slot.includes('|')) {
    const [courseSlug, dateStart] = slot.split('|');
    where.push('course_slug = ? AND date_start = ?');
    binds.push(courseSlug, dateStart);
  }

  const sql =
    `SELECT * FROM registrations` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY date_start ASC, created_at ASC`;

  const { results } = await env.DB.prepare(sql).bind(...binds).all();

  if (url.searchParams.get('format') === 'csv') {
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="rejestracje-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Slot summary so the panel can show "10 / 10" per edition without the client
  // recomputing it from the rows (which would miss editions with zero signups).
  let slotSummary = [];
  try {
    const slots = await loadSlots(context);
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
      courseTitle: s.courseTitle,
      label: s.label,
      dateStart: s.dateStart,
      ...availabilityFor(s, taken.get(s.key) ?? 0),
    }));
  } catch (err) {
    console.error('slot summary unavailable:', err.message);
  }

  return Response.json(
    { registrations: results, slots: slotSummary, adminEmail: context.data.adminEmail },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
