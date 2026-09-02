import type { RecurrenceConfig, WeekStartsOn } from '../api/types';
import { addDaysToDateOnly, dateKeyInTz, utcDateKey } from './dateKey';

export { addDaysToDateOnly, dateKeyInTz };

export const RECURRENCE_HORIZON_WEEKS = 12;

export function minutesFromHours(hours: number): number {
  const hour = Math.floor(hours);
  const minute = Math.round((hours - hour) * 60);
  return hour * 60 + minute;
}

export function occurrenceDateForSlot(weekStart: Date, day: number): string {
  return addDaysToDateOnly(utcDateKey(weekStart), day);
}

export function recurrenceDayLetters(weekStartsOn: WeekStartsOn): readonly string[] {
  return weekStartsOn === 'sunday'
    ? (['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const)
    : (['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const);
}

export function resolveRecurrenceStartDate(
  weekStart: Date,
  weekdays: number[],
  timezone: string,
): string {
  const today = dateKeyInTz(new Date(), timezone);
  const candidates = weekdays
    .map((day) => occurrenceDateForSlot(weekStart, day))
    .filter((date) => date >= today)
    .sort();

  if (candidates[0]) return candidates[0];

  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);
  return occurrenceDateForSlot(nextWeekStart, Math.min(...weekdays));
}

export function formatWeekdaysShort(
  weekdays: number[],
  dayLabels: readonly string[],
): string {
  return weekdays.map((d) => dayLabels[d]).join(', ');
}

export function formatRecurrenceSummary(
  config: RecurrenceConfig,
  dayLabels: readonly string[],
  timeLabel: string,
): string {
  const days = formatWeekdaysShort(config.weekdays, dayLabels);
  const interval =
    config.intervalWeeks === 2
      ? 'Раз в две недели'
      : 'Каждую неделю';
  const end = config.endDate ? ` · до ${config.endDate}` : '';
  return `${interval} · ${days} · ${timeLabel}${end}`;
}

export function formatScheduleWhen(
  weekdayLabels: string,
  timeLabel: string,
  durationLabel: string,
): string {
  return `${weekdayLabels}, ${timeLabel} · ${durationLabel}`;
}

export function minutesToTimeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function toggleWeekday(weekdays: number[], day: number): number[] {
  const set = new Set(weekdays);
  if (set.has(day)) {
    if (set.size === 1) return weekdays;
    set.delete(day);
  } else {
    set.add(day);
  }
  return [...set].sort((a, b) => a - b);
}
