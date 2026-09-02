import type { WeekStartsOn } from '../api/types';

/** en-GB → dd/mm/yyyy, en-US → mm/dd/yyyy */
export function dateLocaleForWeekStart(weekStartsOn: WeekStartsOn): string {
  return weekStartsOn === 'sunday' ? 'en-US' : 'en-GB';
}

export function todayDateKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** Format YYYY-MM-DD for display (order follows week start: EU vs US). */
export function fmtDateKey(key: string, weekStartsOn: WeekStartsOn = 'monday'): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(dateLocaleForWeekStart(weekStartsOn), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(y, (m ?? 1) - 1, d ?? 1));
}

export function fmtDateParts(
  y: number,
  m: number,
  d: number,
  weekStartsOn: WeekStartsOn = 'monday',
): string {
  return fmtDateKey(
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    weekStartsOn,
  );
}

function isValidDateParts(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Parse display or ISO date to YYYY-MM-DD (order follows week start: EU vs US). */
export function parseDateKey(
  input: string,
  weekStartsOn: WeekStartsOn = 'monday',
): string | null {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return isValidDateParts(y!, m!, d!) ? trimmed : null;
  }

  const parts = trimmed.split(/[./-]/).map((p) => p.trim());
  if (parts.length !== 3) return null;

  let day: number;
  let month: number;
  let year = Number(parts[2]);
  if (year < 100) year += 2000;

  if (weekStartsOn === 'sunday') {
    month = Number(parts[0]);
    day = Number(parts[1]);
  } else {
    day = Number(parts[0]);
    month = Number(parts[1]);
  }

  if (!isValidDateParts(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** YYYY-MM-DD of a date-only UTC midnight `Date`. */
export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDateOnly(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

export function addDaysToDateOnly(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDateOnly(isoDate);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD of `d` in `tz`. */
export function dateKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function diffDateKeys(fromKey: string, toKey: string): number {
  const a = parseIsoDateOnly(fromKey);
  const b = parseIsoDateOnly(toKey);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) /
      86_400_000,
  );
}
