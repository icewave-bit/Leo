import type { RecurrenceConfig, WeekStartsOn } from '../api/types';

export const RECURRENCE_HORIZON_WEEKS = 12;

export function minutesFromHours(hours: number): number {
  const hour = Math.floor(hours);
  const minute = Math.round((hours - hour) * 60);
  return hour * 60 + minute;
}

export function dateKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function occurrenceDateForSlot(
  weekStart: Date,
  day: number,
  timezone: string,
): string {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + day);
  return dateKeyInTz(d, timezone);
}

export function addDaysToDateOnly(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day!));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    .map((day) => occurrenceDateForSlot(weekStart, day, timezone))
    .filter((date) => date >= today)
    .sort();

  if (candidates[0]) return candidates[0];

  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);
  return occurrenceDateForSlot(nextWeekStart, Math.min(...weekdays), timezone);
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
