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
