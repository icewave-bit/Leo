export type UUID = string;

export type LessonStatus = 'planned' | 'completed' | 'cancelled' | 'no_show';
export type LessonType = 'solo' | 'group';
export type BalanceKind = 'money' | 'lessons';
export type WeekStartsOn = 'monday' | 'sunday';
export type AcademicUnits = 1 | 2;
export type TaxDisplayCurrency = 'BYN' | 'none';
export type PersonalEventOutline = 'tab' | 'frame' | 'dashed';
export type TelegramNotifyLeadMinutes = 5 | 10 | 15 | 30 | 60;

export interface TelegramNotify {
  enabled: boolean;
  leadMinutes: TelegramNotifyLeadMinutes;
  silent: boolean;
  lessons: boolean;
  personal: boolean;
  /** Empty = all groups when personal is true. */
  personalGroupIds: UUID[];
}

export interface Tutor {
  id: UUID;
  email: string;
  name: string;
  initials: string;
  subject: string | null;
  timezone: string;
  academicHourMin: number;
  weekStartsOn: WeekStartsOn;
  defaultReplenishBalanceKind: BalanceKind;
  taxRatePercent: number;
  taxDisplayCurrency: TaxDisplayCurrency;
  /** Calendar weekdays to hide in schedule UI: Mon=0 … Sun=6. */
  hiddenWeekdays: number[];
  /** Default blocked window start, minutes from midnight (hour-aligned). */
  defaultBlockStartMinutes: number;
  /** Default blocked window end, minutes from midnight (hour-aligned). */
  defaultBlockEndMinutes: number;
  /** Personal schedule card outline style in week grid. */
  personalEventOutline: PersonalEventOutline;
  /** Whether a Telegram account is linked for the bot. */
  telegramLinked: boolean;
  /** Telegram @username when linked (display only). */
  telegramUsername: string | null;
  telegramNotify: TelegramNotify;
  createdAt: string;
}

export interface Student {
  id: UUID;
  tutorId: UUID;
  name: string;
  initials: string;
  hue: number;
  tz: string;
  meetUrl: string | null;
  rate: number | null;
  currency: string;
  note: string | null;
  isGroup: boolean;
  members: string[];
  balanceKind: BalanceKind;
  prepaid: number;
  debt: number;
  excludeFromTaxes: boolean;
  /** When set, balance operations use this student's account. */
  billingStudentId: string | null;
  openLessonDebt: number;
  /** Whether a Telegram account is linked for the student bot. */
  telegramLinked: boolean;
  /** Telegram @username (invite hint / display). */
  telegramUsername: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface Lesson {
  id: UUID;
  tutorId: UUID;
  studentId: UUID;
  startUtc: string;
  durationMin: number;
  academicUnits: AcademicUnits;
  status: LessonStatus;
  type: LessonType;
  paid: boolean;
  notes: string | null;
  balanceCharged: boolean;
  chargeDebtDelta: number;
  balancePaidApplied: boolean;
  recurringScheduleId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringSchedule {
  id: UUID;
  tutorId: UUID;
  studentId: UUID;
  weekdays: number[];
  startMinutes: number;
  durationMin: number;
  academicUnits: AcademicUnits;
  type: LessonType;
  notes: string | null;
  intervalWeeks: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalEventGroup {
  id: UUID;
  tutorId: UUID;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalEvent {
  id: UUID;
  tutorId: UUID;
  groupId: UUID;
  title: string;
  startUtc: string;
  durationMin: number;
  notes: string | null;
  recurringPersonalScheduleId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringPersonalSchedule {
  id: UUID;
  tutorId: UUID;
  groupId: UUID;
  title: string;
  weekdays: number[];
  startMinutes: number;
  durationMin: number;
  notes: string | null;
  intervalWeeks: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleSlotOverride {
  weekday: number;
  startMinutes: number;
  blocked: boolean;
}

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'TELEGRAM_NOT_LINKED'
  | 'INTERNAL';
