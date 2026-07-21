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

/** Local wall-clock Y-M-D H:M in `timezone` → UTC Date. */
export function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(utc), timezone);
    const want = Date.UTC(year, month - 1, day, hour, minute);
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    utc += want - got;
  }
  return new Date(utc);
}

/** [start, end) of the calendar day `dayOffset` days from today in `timezone` (0 = today). */
export function zonedDayOffsetRangeUtc(
  now: Date,
  timezone: string,
  dayOffset: number,
): { from: Date; to: Date } {
  const todayKey = dateKeyInTz(now, timezone);
  const dayKey = addDaysToDateOnly(todayKey, dayOffset);
  const { year, month, day } = parseDateOnly(dayKey);
  const from = wallClockToUtc(year, month, day, 0, 0, timezone);
  const next = addDaysToDateOnly(dayKey, 1);
  const n = parseDateOnly(next);
  const to = wallClockToUtc(n.year, n.month, n.day, 0, 0, timezone);
  return { from, to };
}

/** [start, end) of the calendar day containing `now` in `timezone`. */
export function zonedDayRangeUtc(now: Date, timezone: string): { from: Date; to: Date } {
  return zonedDayOffsetRangeUtc(now, timezone, 0);
}

/**
 * Current week [start, end) in tutor timezone, using weekStartsOn
 * (Mon=0 … Sun=6 alignment matching the schedule grid).
 */
export function zonedWeekRangeUtc(
  now: Date,
  timezone: string,
  weekStartsOn: WeekStartsOn,
): { from: Date; to: Date } {
  const todayKey = dateKeyInTz(now, timezone);
  const { year, month, day } = parseDateOnly(todayKey);
  // UTC noon on that calendar date → weekday in that zone is stable for week math.
  const noonUtc = wallClockToUtc(year, month, day, 12, 0, timezone);
  const parts = zonedParts(noonUtc, timezone);
  const asUtcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekStartUtc = startOfWeekUTC(asUtcDate, weekStartsOn);
  const startKey = weekStartUtc.toISOString().slice(0, 10);
  const endKey = addDaysToDateOnly(startKey, 7);
  const s = parseDateOnly(startKey);
  const e = parseDateOnly(endKey);
  return {
    from: wallClockToUtc(s.year, s.month, s.day, 0, 0, timezone),
    to: wallClockToUtc(e.year, e.month, e.day, 0, 0, timezone),
  };
}
