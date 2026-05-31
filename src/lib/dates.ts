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
