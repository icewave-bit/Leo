import type { ScheduleSlotOverride, Tutor } from '../api/types';
import type { WeekStartsOn } from '../api/types';
import { gridDayToCalendarDow } from './schedule';
import type { ViewLesson, ViewPersonalEvent } from './schedule';
import { fmtTime } from './format';

export const DEFAULT_BLOCK_START_MINUTES = 22 * 60;
export const DEFAULT_BLOCK_END_MINUTES = 8 * 60;

export interface DefaultBlockWindow {
  startMinutes: number;
  endMinutes: number;
}

export const DEFAULT_BLOCK_WINDOW: DefaultBlockWindow = {
  startMinutes: DEFAULT_BLOCK_START_MINUTES,
  endMinutes: DEFAULT_BLOCK_END_MINUTES,
};

export function defaultBlockWindowFromTutor(
  tutor: Pick<Tutor, 'defaultBlockStartMinutes' | 'defaultBlockEndMinutes'> | null | undefined,
): DefaultBlockWindow {
  return {
    startMinutes: tutor?.defaultBlockStartMinutes ?? DEFAULT_BLOCK_START_MINUTES,
    endMinutes: tutor?.defaultBlockEndMinutes ?? DEFAULT_BLOCK_END_MINUTES,
  };
}

export function formatBlockWindowLabel(window: DefaultBlockWindow): string {
  const start = window.startMinutes / 60;
  const end = window.endMinutes / 60;
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export interface BlockedRange {
  start: number;
  end: number;
}

export interface TimedGridItem {
  day: number;
  start: number;
  dur: number;
}

export function isDefaultBlocked(
  hour: number,
  window: DefaultBlockWindow = DEFAULT_BLOCK_WINDOW,
): boolean {
  const startHour = window.startMinutes / 60;
  const endHour = window.endMinutes / 60;
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

export function hourToStartMinutes(hour: number): number {
  return hour * 60;
}

export function hasEventInHour(
  day: number,
  hour: number,
  lessons: readonly ViewLesson[],
  personalEvents: readonly ViewPersonalEvent[],
): boolean {
  const overlaps = (start: number, dur: number) =>
    start < hour + 1 && start + dur > hour;

  return (
    lessons.some((l) => l.day === day && overlaps(l.start, l.dur)) ||
    personalEvents.some((e) => e.day === day && overlaps(e.start, e.dur))
  );
}

export function findSlotOverride(
  overrides: readonly ScheduleSlotOverride[],
  calendarWeekday: number,
  startMinutes: number,
): ScheduleSlotOverride | undefined {
  return overrides.find(
    (o) => o.weekday === calendarWeekday && o.startMinutes === startMinutes,
  );
}

export function isLessonSlotBlocked(
  day: number,
  hour: number,
  weekStartsOn: WeekStartsOn,
  overrides: readonly ScheduleSlotOverride[],
  lessons: readonly ViewLesson[],
  personalEvents: readonly ViewPersonalEvent[],
  window: DefaultBlockWindow = DEFAULT_BLOCK_WINDOW,
): boolean {
  const calendarDow = gridDayToCalendarDow(day, weekStartsOn);
  const startMinutes = hourToStartMinutes(hour);
  const hasEvent = hasEventInHour(day, hour, lessons, personalEvents);
  const override = findSlotOverride(overrides, calendarDow, startMinutes);

  if (override) return override.blocked;
  if (hasEvent) return false;
  return isDefaultBlocked(hour, window);
}

export function blockedRangesByGridDay(
  weekStartsOn: WeekStartsOn,
  overrides: readonly ScheduleSlotOverride[],
  lessons: readonly ViewLesson[],
  personalEvents: readonly ViewPersonalEvent[],
  window: DefaultBlockWindow = DEFAULT_BLOCK_WINDOW,
): Map<number, BlockedRange[]> {
  const map = new Map<number, BlockedRange[]>();

  for (let gridDay = 0; gridDay < 7; gridDay++) {
    const ranges: BlockedRange[] = [];
    let rangeStart: number | null = null;

    for (let hour = 0; hour < 24; hour++) {
      const blocked = isLessonSlotBlocked(
        gridDay,
        hour,
        weekStartsOn,
        overrides,
        lessons,
        personalEvents,
        window,
      );
      if (blocked) {
        if (rangeStart === null) rangeStart = hour;
      } else if (rangeStart !== null) {
        ranges.push({ start: rangeStart, end: hour });
        rangeStart = null;
      }
    }
    if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: 24 });
    }
    map.set(gridDay, ranges);
  }

  return map;
}

export function isHourBlocked(hour: number, blocked: readonly BlockedRange[]): boolean {
  if (blocked.length === 0) return false;
  const h = hour + 0.001;
  return blocked.some((r) => h >= r.start && h < r.end);
}

export function isSlotOffHours(
  day: number,
  startHour: number,
  blockedByDay: Map<number, BlockedRange[]>,
): boolean {
  const blocked = blockedByDay.get(day) ?? [];
  return isHourBlocked(startHour, blocked);
}

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);
