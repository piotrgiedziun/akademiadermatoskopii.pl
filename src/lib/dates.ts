/**
 * Polish date formatting helpers. All routes use these — keep locale consistent.
 */

const LONG = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const SHORT = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const MONTH_DAY = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
});

const WEEKDAY = new Intl.DateTimeFormat('pl-PL', { weekday: 'long' });

export function formatDateLong(date: Date | string): string {
  return LONG.format(new Date(date));
}

export function formatDateShort(date: Date | string): string {
  return SHORT.format(new Date(date));
}

export function formatMonthDay(date: Date | string): string {
  return MONTH_DAY.format(new Date(date));
}

export function formatWeekday(date: Date | string): string {
  return WEEKDAY.format(new Date(date));
}

/**
 * Format a date range: "21–22 marca 2026" or "16 stycznia 2026" if single day.
 */
export function formatDateRange(start: Date | string, end?: Date | string | null): string {
  const s = new Date(start);
  if (!end) return LONG.format(s);
  const e = new Date(end);
  if (s.toDateString() === e.toDateString()) return LONG.format(s);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    const sDay = s.getDate();
    const ePart = LONG.format(e); // "22 marca 2026"
    return `${sDay}–${ePart}`;
  }
  return `${MONTH_DAY.format(s)} – ${LONG.format(e)}`;
}

/**
 * Compact numeric range for the harmonogram list: "16–17.01.2026" for a
 * multi-day edition, "21.02.2026" for a single day. Month is zero-padded, day
 * is not — matches the format the schedule has always been written in.
 */
export function formatDateRangeNumeric(start: Date | string, end?: Date | string | null): string {
  const s = new Date(start);
  const pad = (n: number) => String(n).padStart(2, '0');
  const single = (d: Date) => `${d.getDate()}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

  if (!end) return single(s);
  const e = new Date(end);
  if (s.toDateString() === e.toDateString()) return single(s);

  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  // "16–17.01.2026" — the shared month/year is printed once, on the end date.
  if (sameMonth) return `${s.getDate()}–${single(e)}`;
  // Cross-month ("30.11–1.12.2026") — both months needed, year still once.
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}.${pad(s.getMonth() + 1)}–${single(e)}`;
  }
  return `${single(s)}–${single(e)}`;
}

/** Relative time in Polish ("3 dni temu", "dzisiaj", "za 2 tygodnie"). */
export function formatRelative(date: Date | string, now = new Date()): string {
  const d = new Date(date);
  const diffMs = d.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat('pl-PL', { numeric: 'auto' });
  const days = Math.round(diffMs / 86_400_000);
  if (Math.abs(days) < 1) return 'dzisiaj';
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(months, 'month');
  return rtf.format(Math.round(months / 12), 'year');
}

export function isoDate(date: Date | string): string {
  return new Date(date).toISOString();
}
