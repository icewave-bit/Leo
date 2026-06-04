export type UUID = string;

export type LessonStatus = 'planned' | 'completed' | 'cancelled' | 'no_show';
export type LessonType = 'solo' | 'group';
export type BalanceKind = 'money' | 'lessons';
export type WeekStartsOn = 'monday' | 'sunday';
export type AcademicUnits = 1 | 2;
export type TaxDisplayCurrency = 'BYN' | 'none';

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

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INTERNAL';
