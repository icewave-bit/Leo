import type { WeekStartsOn } from './types.js';

function zonedParts(
  d: Date,
  tz: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute') };
}

export function startOfWeekUTC(d: Date, weekStartsOn: WeekStartsOn): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();
  const diff = weekStartsOn === 'sunday' ? -dow : dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

/** Wall-clock slot in the tutor week grid → UTC ISO. */
export function slotToStartUtc(
  weekStart: Date,
  day: number,
  startHours: number,
  timezone: string,
): string {
  const hour = Math.floor(startHours);
  const minute = Math.round((startHours - hour) * 60);
  const base = new Date(weekStart);
  base.setUTCDate(base.getUTCDate() + day);
  const { year, month, day: dom } = zonedParts(base, timezone);

  let utc = Date.UTC(year, month - 1, dom, hour, minute);
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(utc), timezone);
    const want = Date.UTC(year, month - 1, dom, hour, minute);
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    utc += want - got;
  }
  return new Date(utc).toISOString();
}

export function dateKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function weekdayIndexInWeek(
  date: Date,
  weekStart: Date,
  timezone: string,
): number {
  const target = dateKeyInTz(date, timezone);
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    if (dateKeyInTz(d, timezone) === target) return i;
  }
  return 0;
}

export function parseDateOnly(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

export function addDaysToDateOnly(isoDate: string, days: number): string {
  const { year, month, day } = parseDateOnly(isoDate);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
