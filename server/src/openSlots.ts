import {
  isDefaultBlocked,
  type DefaultBlockWindow,
  type SlotOverrideRow,
} from './scheduleBlocks.js';
import {
  addDaysToDateOnly,
  dateKeyInTz,
  parseDateOnly,
  wallClockToUtc,
  zonedWeekRangeUtc,
} from './scheduleSlots.js';
import type { WeekStartsOn } from './types.js';

export interface TimedOccupancy {
  startUtc: string | Date;
  durationMin: number;
}

export interface OpenSlotRange {
  /** YYYY-MM-DD in tutor timezone */
  date: string;
  /** Calendar weekday Mon=0 … Sun=6 */
  weekday: number;
  /** Inclusive start hour 0–23 */
  startHour: number;
  /** Exclusive end hour 1–24 */
  endHour: number;
}

export interface OpenSlotsDay {
  date: string;
  weekday: number;
  ranges: Array<{ startHour: number; endHour: number }>;
}

function gridDayToCalendarDow(gridDay: number, weekStartsOn: WeekStartsOn): number {
  return weekStartsOn === 'monday' ? gridDay : (gridDay + 6) % 7;
}

function zonedHourParts(
  d: Date,
  timezone: string,
): { dateKey: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
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
  const month = String(get('month')).padStart(2, '0');
  const day = String(get('day')).padStart(2, '0');
  return {
    dateKey: `${get('year')}-${month}-${day}`,
    hour,
    minute: get('minute'),
  };
}

function findOverride(
  overrides: readonly SlotOverrideRow[],
  weekday: number,
  startMinutes: number,
): SlotOverrideRow | undefined {
  return overrides.find((o) => o.weekday === weekday && o.start_minutes === startMinutes);
}

/** Hour is bookable: not blocked by default/override and not occupied. */
export function isHourOpen(
  hour: number,
  calendarWeekday: number,
  hasEvent: boolean,
  overrides: readonly SlotOverrideRow[],
  window: DefaultBlockWindow,
): boolean {
  const startMinutes = hour * 60;
  const override = findOverride(overrides, calendarWeekday, startMinutes);
  if (override) {
    if (override.blocked) return false;
    return !hasEvent;
  }
  if (hasEvent) return false;
  return !isDefaultBlocked(startMinutes, window);
}

function occupiedHoursByDate(
  events: readonly TimedOccupancy[],
  timezone: string,
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const event of events) {
    const start = event.startUtc instanceof Date ? event.startUtc : new Date(event.startUtc);
    const end = new Date(start.getTime() + event.durationMin * 60_000);
    // Walk in 30-min steps to catch partial-hour overlaps.
    for (let t = start.getTime(); t < end.getTime(); t += 30 * 60_000) {
      const { dateKey, hour, minute } = zonedHourParts(new Date(t), timezone);
      const set = map.get(dateKey) ?? new Set<number>();
      set.add(hour);
      // If event starts mid-hour, that hour is still occupied.
      if (minute > 0 || t === start.getTime()) {
        set.add(hour);
      }
      map.set(dateKey, set);
    }
    // Ensure last partial hour is marked (end exclusive).
    const endParts = zonedHourParts(new Date(end.getTime() - 1), timezone);
    const endSet = map.get(endParts.dateKey) ?? new Set<number>();
    endSet.add(endParts.hour);
    map.set(endParts.dateKey, endSet);
  }
  return map;
}

/**
 * Free hour ranges for the current week in tutor timezone.
 * Skips hidden calendar weekdays. Times only — no event titles.
 */
export function computeOpenSlotsForWeek(input: {
  now?: Date;
  timezone: string;
  weekStartsOn: WeekStartsOn;
  hiddenWeekdays?: readonly number[];
  blockWindow: DefaultBlockWindow;
  overrides: readonly SlotOverrideRow[];
  occupied: readonly TimedOccupancy[];
}): OpenSlotsDay[] {
  const now = input.now ?? new Date();
  const hidden = new Set(input.hiddenWeekdays ?? []);
  const { from } = zonedWeekRangeUtc(now, input.timezone, input.weekStartsOn);
  const startKey = dateKeyInTz(from, input.timezone);
  const occupied = occupiedHoursByDate(input.occupied, input.timezone);

  const days: OpenSlotsDay[] = [];

  for (let gridDay = 0; gridDay < 7; gridDay++) {
    const date = addDaysToDateOnly(startKey, gridDay);
    const weekday = gridDayToCalendarDow(gridDay, input.weekStartsOn);
    if (hidden.has(weekday)) continue;

    const busy = occupied.get(date) ?? new Set<number>();
    const ranges: Array<{ startHour: number; endHour: number }> = [];
    let rangeStart: number | null = null;

    for (let hour = 0; hour < 24; hour++) {
      const open = isHourOpen(
        hour,
        weekday,
        busy.has(hour),
        input.overrides,
        input.blockWindow,
      );
      if (open) {
        if (rangeStart === null) rangeStart = hour;
      } else if (rangeStart !== null) {
        ranges.push({ startHour: rangeStart, endHour: hour });
        rangeStart = null;
      }
    }
    if (rangeStart !== null) {
      ranges.push({ startHour: rangeStart, endHour: 24 });
    }

    days.push({ date, weekday, ranges });
  }

  return days;
}

/** Helper for tests: wall-clock occupancy in a timezone. */
export function wallEvent(
  date: string,
  hour: number,
  durationMin: number,
  timezone: string,
): TimedOccupancy {
  const { year, month, day } = parseDateOnly(date);
  const start = wallClockToUtc(year, month, day, hour, 0, timezone);
  return { startUtc: start.toISOString(), durationMin };
}
