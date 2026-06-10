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
