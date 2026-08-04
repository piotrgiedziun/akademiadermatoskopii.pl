/**
 * One-off import of Google Forms registrations into D1.
 *
 * Only editions still in the future are imported — past courses are history and
 * belong in the spreadsheet, not in a table whose job is to gate capacity.
 * Imported rows land as `confirmed`, because these people registered through
 * the old form and were already treated as booked; that reproduces today's
 * reality (notably chirurgia-skory 2026-10-24 sitting at 10/10 and closed).
 *
 * Usage:
 *   node scripts/import-registrations.mjs <path-to-csv> > /tmp/import.sql
 *   npx wrangler d1 execute akademia-rejestracje --remote --file=/tmp/import.sql
 *
 * Reads the live slot catalogue from dist/terminy.json, so a course edition
 * that no longer exists in the CMS is reported rather than silently imported.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CSV = process.argv[2];
if (!CSV) {
  console.error('Usage: node scripts/import-registrations.mjs <csv> [> out.sql]');
  process.exit(1);
}

/** Google Forms column indices. Titles repeat, so position is the only key. */
const COL = {
  timestamp: 0,
  fullName: 1,
  pwz: 2,
  email: 3,
  phone: 4,
  titlePrefix: 5,
  invoice: 6,
  level: 7,
  consent: 11,
};

/**
 * The form branched per course level, producing eight "Termin kursu" columns.
 * Which one holds the answer depends on the branch taken and is not stable
 * across editions, so every candidate is scanned and the first filled one wins.
 */
const TERM_COLS = [8, 9, 10, 12, 13, 14, 17, 18];

/**
 * Course level labels → course slugs. The label carries a price that drifted
 * over time ("Podstawowy (1500 zł)" became "Kurs dermatoskopowy podstawowy
 * (1600 zł)"), which is exactly why price is no longer stored in a label.
 */
const LEVEL_TO_SLUG = [
  [/dermatoskopowy podstawowy|^Podstawowy/i, 'dermatoskopia-podstawowa'],
  [/dermatoskopowy zaawansowany|^Zaawansowany/i, 'dermatoskopia-zaawansowana'],
  [/Chirurgia sk/i, 'chirurgia-skory'],
  [/pisania prac naukowych/i, 'pisanie-prac-naukowych'],
  [/Trudne lokalizacje/i, 'trudne-lokalizacje'],
  [/laser/i, 'laser-co2'],
  [/badań klinicznych/i, 'praktyczne-aspekty-badań-klinicznych'],
];

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** '25-26.09.2026 Wrocław' / '24.10.2026' → '2026-09-25'. */
function toISODate(raw) {
  const m = raw.match(/(\d{1,2})(?:\s*-\s*\d{1,2})?\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 'M/D/YYYY H:MM:SS' → ISO. Falls back to the epoch-free "unknown" marker. */
function toISOTimestamp(raw) {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, mo, d, y, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
}

function slugFor(level) {
  for (const [re, slug] of LEVEL_TO_SLUG) if (re.test(level)) return slug;
  return null;
}

/**
 * Deterministic id from the response's identifying fields, so re-running the
 * import cannot create duplicates (the PRIMARY KEY rejects the second attempt).
 */
function stableId(email, slug, date) {
  return 'gf-' + createHash('sha256').update(`${email}|${slug}|${date}`).digest('hex').slice(0, 24);
}

const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

// --- load inputs ------------------------------------------------------------

const catalogue = JSON.parse(readFileSync('dist/terminy.json', 'utf8'));
const known = new Map(catalogue.slots.map((s) => [s.key, s]));

const rows = parseCSV(readFileSync(CSV, 'utf8')).slice(1).filter((r) => r.length > 10);

// --- transform --------------------------------------------------------------

const out = [];
const skipped = { pastOrUnknownSlot: 0, noTerm: 0, unmappedLevel: 0, noEmail: 0 };
const perSlot = new Map();

for (const r of rows) {
  const email = (r[COL.email] || '').trim().toLowerCase();
  const level = (r[COL.level] || '').trim();
  const termRaw = TERM_COLS.map((c) => (r[c] || '').trim()).find(Boolean) || '';

  if (!email) { skipped.noEmail++; continue; }
  if (!termRaw) { skipped.noTerm++; continue; }

  const slug = slugFor(level);
  if (!slug) { skipped.unmappedLevel++; continue; }

  const date = toISODate(termRaw);
  const slot = known.get(`${slug}|${date}`);
  // Not in the catalogue = the edition already happened or was removed.
  if (!slot) { skipped.pastOrUnknownSlot++; continue; }

  const created = toISOTimestamp(r[COL.timestamp]) ?? new Date().toISOString();
  const consented = Boolean((r[COL.consent] || '').trim());

  perSlot.set(slot.key, (perSlot.get(slot.key) ?? 0) + 1);

  out.push(
    `INSERT INTO registrations (id, created_at, course_slug, date_start, status, ` +
      `full_name, title_prefix, pwz, email, phone, invoice_data, price_amount, ` +
      `consent_at, consent_version, notes, confirmed_at, confirmed_by, source) VALUES (` +
      [
        q(stableId(email, slug, date)),
        q(created),
        q(slug),
        q(date),
        `'confirmed'`,
        q((r[COL.fullName] || '').trim()),
        q((r[COL.titlePrefix] || '').trim()),
        q((r[COL.pwz] || '').trim()),
        q(email),
        q((r[COL.phone] || '').trim()),
        q((r[COL.invoice] || '').trim()),
        // Price comes from the CMS, not from the drifting form label.
        String(slot.priceAmount),
        q(created),
        // The old form's clause, stamped with when it was actually collected.
        q('google-forms'),
        consented ? 'NULL' : q('UWAGA: brak zapisanej zgody RODO w formularzu Google'),
        q(created),
        q('import'),
        `'google-forms-import'`,
      ].join(', ') +
      ');',
  );
}

// --- emit -------------------------------------------------------------------

console.log('-- Generated by scripts/import-registrations.mjs. Safe to re-run:');
console.log('-- ids are derived from email+course+date, so repeats hit the PRIMARY KEY.');
// No BEGIN TRANSACTION/COMMIT: D1 is Durable-Objects-backed and rejects explicit
// SQL transactions. `wrangler d1 execute --file` already applies the batch
// atomically and restores the original state if any statement fails.
out.forEach((l) => console.log(l));

const report = [
  `rows in CSV:        ${rows.length}`,
  `imported:           ${out.length}`,
  `skipped (past/unknown edition): ${skipped.pastOrUnknownSlot}`,
  `skipped (no term):  ${skipped.noTerm}`,
  `skipped (unmapped level): ${skipped.unmappedLevel}`,
  `skipped (no email): ${skipped.noEmail}`,
  '',
  'per slot:',
  ...[...perSlot.entries()]
    .sort()
    .map(([k, n]) => {
      const cap = known.get(k).capacity;
      const flag = cap !== null && n >= cap ? '  ← FULL' : '';
      return `  ${k.padEnd(45)} ${String(n).padStart(3)} / ${cap ?? '—'}${flag}`;
    }),
].join('\n');

console.error(report);
