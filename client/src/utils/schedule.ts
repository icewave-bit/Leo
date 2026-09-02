import type {
  AcademicUnits,
  BalanceKind,
  Lesson,
  LessonStatus,
  PersonalEvent,
  Student,
  WeekStartsOn,
} from '../api/types';
import { WG_SNAP_MINUTES } from '../constants/weekGrid';
import {
  addDaysToDateOnly,
  dateKeyInTz,
  diffDateKeys,
  parseIsoDateOnly,
  utcDateKey,
} from './dateKey';
import { fmtTime } from './format';

export type UiLessonStatus = 'planned' | 'completed' | 'cancelled' | 'no-show';

export interface ViewLesson {
  id: string;
  studentId: string;
  startUtc: string;
  durationMin: number;
  day: number;
  start: number;
  dur: number;
  academicUnits: AcademicUnits;
  status: UiLessonStatus;
  paid: boolean;
  balanceCharged: boolean;
  chargeDebtDelta: number;
  balancePaidApplied: boolean;
  recurringScheduleId: string | null;
  type: 'solo' | 'group';
  notes: string | null;
}

export interface ViewStudent {
  id: string;
  name: string;
  initials: string;
  hue: number;
  tz: string;
  rate: number | null;
  currency: string;
  meet: string | null;
  note: string | null;
  group: boolean;
  members: string[];
  balanceKind: BalanceKind;
  prepaid: number;
  debt: number;
  excludeFromTaxes: boolean;
  billingStudentId: string | null;
  openLessonDebt: number;
  telegramLinked: boolean;
  telegramUsername: string | null;
  archivedAt?: string | null;
}

const DAYS_MON = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
const DAYS_FULL_MON = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
] as const;
const DAYS_SUN = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;
const DAYS_FULL_SUN = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
] as const;

/** @deprecated Use weekDayNames(weekStartsOn).short */
export const DAYS = [...DAYS_MON];
/** @deprecated Use weekDayNames(weekStartsOn).full */
export const DAYS_FULL = [...DAYS_FULL_MON];

export function weekDayNames(weekStartsOn: WeekStartsOn): {
  short: readonly string[];
  full: readonly string[];
} {
  return weekStartsOn === 'sunday'
    ? { short: DAYS_SUN, full: DAYS_FULL_SUN }
    : { short: DAYS_MON, full: DAYS_FULL_MON };
}

/** Mon=0 … Sun=6 — stable calendar labels for settings (independent of weekStartsOn). */
export const CALENDAR_WEEKDAY_SHORT = DAYS_MON;
export const CALENDAR_WEEKDAY_FULL = DAYS_FULL_MON;

/** Grid column index → calendar weekday Mon=0 … Sun=6. */
export function gridDayToCalendarDow(gridDay: number, weekStartsOn: WeekStartsOn): number {
  return weekStartsOn === 'monday' ? gridDay : (gridDay + 6) % 7;
}

/** Calendar weekday → grid column index for the current weekStartsOn. */
export function calendarDowToGridDay(calendarDow: number, weekStartsOn: WeekStartsOn): number {
  return weekStartsOn === 'monday' ? calendarDow : (calendarDow + 1) % 7;
}

export function isGridDayHidden(
  gridDay: number,
  weekStartsOn: WeekStartsOn,
  hiddenCalendarDays: readonly number[],
): boolean {
  return hiddenCalendarDays.includes(gridDayToCalendarDow(gridDay, weekStartsOn));
}

/** Visible grid column indices (0..6) for the week grid and schedule views. */
export function visibleGridDays(
  weekStartsOn: WeekStartsOn,
  hiddenCalendarDays: readonly number[],
): number[] {
  const hidden = new Set(hiddenCalendarDays);
  return [0, 1, 2, 3, 4, 5, 6].filter(
    (gridDay) => !hidden.has(gridDayToCalendarDow(gridDay, weekStartsOn)),
  );
}

export function clampGridDayToVisible(
  gridDay: number,
  weekStartsOn: WeekStartsOn,
  hiddenCalendarDays: readonly number[],
): number {
  const visible = visibleGridDays(weekStartsOn, hiddenCalendarDays);
  if (visible.length === 0) return gridDay;
  return visible.includes(gridDay) ? gridDay : visible[0]!;
}

export function startOfWeekUTC(d: Date, weekStartsOn: WeekStartsOn): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();
  const diff = weekStartsOn === 'sunday' ? -dow : dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

/** @deprecated Use startOfWeekUTC(d, 'monday') */
export function startOfWeekMondayUTC(d: Date): Date {
  return startOfWeekUTC(d, 'monday');
}

/**
 * Week containing `anchor` in `timezone`.
 * `weekStart` is UTC midnight of the week-start calendar date (date-only).
 * `from`/`to` are tutor-local midnights as UTC ISO (fetch window).
 */
export function weekRangeUtc(
  anchor: Date,
  weekStartsOn: WeekStartsOn,
  timezone: string,
): { from: string; to: string; weekStart: Date } {
  const dateKey = calendarDateKey(anchor, timezone);
  const { year, month, day } = parseIsoDateOnly(dateKey);
  const weekStart = startOfWeekUTC(new Date(Date.UTC(year, month - 1, day)), weekStartsOn);
  const startKey = utcDateKey(weekStart);
  const endKey = addDaysToDateOnly(startKey, 7);
  const s = parseIsoDateOnly(startKey);
  const e = parseIsoDateOnly(endKey);
  return {
    from: wallClockToUtc(s.year, s.month, s.day, 0, 0, timezone).toISOString(),
    to: wallClockToUtc(e.year, e.month, e.day, 0, 0, timezone).toISOString(),
    weekStart,
  };
}

export function shiftWeek(weekStart: Date, deltaWeeks: number): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return d;
}

export function weekDates(weekStart: Date, _timezone?: string): number[] {
  const weekKey = utcDateKey(weekStart);
  return Array.from({ length: 7 }, (_, i) => parseIsoDateOnly(addDaysToDateOnly(weekKey, i)).day);
}

export function todayDayIndex(weekStart: Date, timezone: string, now = new Date()): number | null {
  const idx = diffDateKeys(utcDateKey(weekStart), dateKeyInTz(now, timezone));
  return idx >= 0 && idx < 7 ? idx : null;
}

/** Date-only week starts are UTC midnight; other instants use the tutor zone. */
function calendarDateKey(d: Date, timezone: string): string {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return utcDateKey(d);
  }
  return dateKeyInTz(d, timezone);
}

function zonedParts(d: Date, tz: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
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

function zonedHourMinute(iso: string, tz: string): { hour: number; minute: number } {
  const { hour, minute } = zonedParts(new Date(iso), tz);
  return { hour, minute };
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

export function toUiStatus(status: LessonStatus): UiLessonStatus {
  return status === 'no_show' ? 'no-show' : status;
}

export function toApiStatus(status: UiLessonStatus): LessonStatus {
  return status === 'no-show' ? 'no_show' : status;
}

/** Wall-clock slot in the tutor week grid → UTC ISO (matches lessonToView). */
export function slotToStartUtc(
  weekStart: Date,
  day: number,
  startHours: number,
  timezone: string,
): string {
  const hour = Math.floor(startHours);
  const minute = Math.round((startHours - hour) * 60);
  const { year, month, day: dom } = parseIsoDateOnly(
    addDaysToDateOnly(utcDateKey(weekStart), day),
  );
  return wallClockToUtc(year, month, dom, hour, minute, timezone).toISOString();
}

function gridDayIndex(startUtc: string, weekStart: Date, timezone: string): number {
  return diffDateKeys(utcDateKey(weekStart), dateKeyInTz(new Date(startUtc), timezone));
}

export interface ViewPersonalEvent {
  id: string;
  groupId: string;
  title: string;
  startUtc: string;
  durationMin: number;
  day: number;
  start: number;
  dur: number;
  notes: string | null;
  recurringPersonalScheduleId: string | null;
}

export interface PersonalEventDraft {
  day: number;
  start: number;
}

export interface LessonDraft {
  day: number;
  start: number;
}

export interface SlotAnchor {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SlotSheetState extends LessonDraft {
  anchor: SlotAnchor;
}

export function slotAnchorFromElement(el: HTMLElement): SlotAnchor {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

const SNAP_HOURS = WG_SNAP_MINUTES / 60;
const DAY_HOURS = 24;

export function snapStartHours(hours: number): number {
  return Math.round(hours / SNAP_HOURS) * SNAP_HOURS;
}

export function clampLessonStart(start: number, durationHours: number): number {
  const snapped = snapStartHours(start);
  return Math.max(0, Math.min(DAY_HOURS - durationHours, snapped));
}

export function formatLessonSlot(
  day: number,
  start: number,
  durationHours: number,
  dates: number[],
  daysFull: readonly string[] = DAYS_FULL_MON,
): string {
  return `${daysFull[day]}, ${dates[day]} · ${fmtTime(start)}–${fmtTime(start + durationHours)}`;
}

export function sameLessonSlot(
  a: { day: number; start: number },
  b: { day: number; start: number },
): boolean {
  return a.day === b.day && Math.abs(a.start - b.start) < 0.001;
}

export function lessonToView(
  lesson: Lesson,
  weekStart: Date,
  timezone: string,
): ViewLesson {
  const day = gridDayIndex(lesson.startUtc, weekStart, timezone);
  const { hour, minute } = zonedHourMinute(lesson.startUtc, timezone);
  return {
    id: lesson.id,
    studentId: lesson.studentId,
    startUtc: lesson.startUtc,
    durationMin: lesson.durationMin,
    day,
    start: hour + minute / 60,
    dur: lesson.durationMin / 60,
    academicUnits: lesson.academicUnits,
    status: toUiStatus(lesson.status),
    paid: lesson.paid,
    balanceCharged: lesson.balanceCharged,
    chargeDebtDelta: lesson.chargeDebtDelta,
    balancePaidApplied: lesson.balancePaidApplied,
    recurringScheduleId: lesson.recurringScheduleId,
    type: lesson.type,
    notes: lesson.notes,
  };
}

export type DayScheduleItem =
  | { kind: 'lesson'; lesson: ViewLesson }
  | { kind: 'personal'; event: ViewPersonalEvent };

export function dayScheduleItems(
  lessons: readonly ViewLesson[],
  personalEvents: readonly ViewPersonalEvent[],
  day: number,
): DayScheduleItem[] {
  const items: DayScheduleItem[] = [
    ...lessons.filter((l) => l.day === day).map((lesson) => ({ kind: 'lesson' as const, lesson })),
    ...personalEvents
      .filter((e) => e.day === day)
      .map((event) => ({ kind: 'personal' as const, event })),
  ];
  items.sort((a, b) => {
    const startA = a.kind === 'lesson' ? a.lesson.start : a.event.start;
    const startB = b.kind === 'lesson' ? b.lesson.start : b.event.start;
    return startA - startB;
  });
  return items;
}

export function personalEventToView(
  event: PersonalEvent,
  weekStart: Date,
  timezone: string,
): ViewPersonalEvent {
  const day = gridDayIndex(event.startUtc, weekStart, timezone);
  const { hour, minute } = zonedHourMinute(event.startUtc, timezone);
  return {
    id: event.id,
    groupId: event.groupId,
    title: event.title,
    startUtc: event.startUtc,
    durationMin: event.durationMin,
    day,
    start: hour + minute / 60,
    dur: event.durationMin / 60,
    notes: event.notes,
    recurringPersonalScheduleId: event.recurringPersonalScheduleId,
  };
}

export function studentToView(s: Student): ViewStudent {
  return {
    id: s.id,
    name: s.name,
    initials: s.initials,
    hue: s.hue,
    tz: s.tz,
    rate: s.rate,
    currency: s.currency,
    meet: s.meetUrl,
    note: s.note,
    group: s.isGroup,
    members: s.members,
    balanceKind: s.balanceKind,
    prepaid: s.prepaid,
    debt: s.debt,
    excludeFromTaxes: s.excludeFromTaxes,
    billingStudentId: s.billingStudentId,
    openLessonDebt: s.openLessonDebt,
    telegramLinked: s.telegramLinked,
    telegramUsername: s.telegramUsername,
    archivedAt: s.archivedAt,
  };
}
