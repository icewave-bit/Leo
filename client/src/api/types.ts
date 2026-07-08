export type LessonStatus = 'planned' | 'completed' | 'cancelled' | 'no_show';
export type LessonType = 'solo' | 'group';
export type BalanceKind = 'money' | 'lessons';
export type WeekStartsOn = 'monday' | 'sunday';
export type AcademicUnits = 1 | 2;
export type TaxDisplayCurrency = 'BYN' | 'none';
export type PersonalEventOutline = 'tab' | 'frame' | 'dashed';

export interface Tutor {
  id: string;
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
  /** Calendar weekdays hidden in schedule: Mon=0 … Sun=6. */
  hiddenWeekdays: number[];
  /** Default blocked window start, minutes from midnight (hour-aligned). */
  defaultBlockStartMinutes: number;
  /** Default blocked window end, minutes from midnight (hour-aligned). */
  defaultBlockEndMinutes: number;
  /** Personal schedule card outline in week grid. */
  personalEventOutline: PersonalEventOutline;
  createdAt: string;
}

export type PatchTutorBody = {
  academicHourMin?: number;
  weekStartsOn?: WeekStartsOn;
  defaultReplenishBalanceKind?: BalanceKind;
  taxRatePercent?: number;
  taxDisplayCurrency?: TaxDisplayCurrency;
  hiddenWeekdays?: number[];
  defaultBlockStartMinutes?: number;
  defaultBlockEndMinutes?: number;
  personalEventOutline?: PersonalEventOutline;
};

export interface Student {
  id: string;
  tutorId: string;
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
  billingStudentId: string | null;
  openLessonDebt: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface BillingDebtEntry {
  studentId: string;
  studentName: string;
  openDebt: number;
}

export interface BillingDebtBreakdown {
  payerId: string;
  payerName: string;
  balanceKind: BalanceKind;
  currency: string;
  walletPrepaid: number;
  walletDebt: number;
  entries: BillingDebtEntry[];
}

export type CreateStudentBody = {
  name: string;
  initials?: string;
  hue?: number;
  tz?: string;
  meetUrl?: string | null;
  rate?: number | null;
  currency?: string;
  note?: string | null;
  isGroup?: boolean;
  members?: string[];
  balanceKind?: BalanceKind;
  prepaid?: number;
  debt?: number;
  excludeFromTaxes?: boolean;
  billingStudentId?: string | null;
};

export type UpdateStudentBody = Partial<CreateStudentBody> & {
  /** YYYY-MM-DD — дата поступления при пополнении prepaid */
  receivedOn?: string;
};

export type BalanceMovementKind =
  | 'replenish'
  | 'manual'
  | 'lesson_charge'
  | 'lesson_paid'
  | 'lesson_reverse';

export interface BalanceMovement {
  id: string;
  studentId: string;
  chargedForStudentId: string | null;
  lessonId: string | null;
  occurredAt: string;
  kind: BalanceMovementKind;
  prepaidDelta: number;
  debtDelta: number;
  prepaidAfter: number;
  debtAfter: number;
  balanceKind: BalanceKind;
}

export interface Lesson {
  id: string;
  tutorId: string;
  studentId: string;
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
  recurringScheduleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringSchedule {
  id: string;
  tutorId: string;
  studentId: string;
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

export interface RecurrenceConfig {
  intervalWeeks: number;
  weekdays: number[];
  endDate: string | null;
}

export interface PersonalEventGroup {
  id: string;
  tutorId: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalEvent {
  id: string;
  tutorId: string;
  groupId: string;
  title: string;
  startUtc: string;
  durationMin: number;
  notes: string | null;
  recurringPersonalScheduleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringPersonalSchedule {
  id: string;
  tutorId: string;
  groupId: string;
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

export interface TaxReplenishment {
  movementId: string;
  studentId: string;
  studentName: string;
  occurredAt: string;
  replenishmentDate: string;
  balanceKind: BalanceKind;
  sourceAmount: number;
  amount: number;
  currency: string;
  amountByn: number | null;
  conversionError: string | null;
  taxPaid: boolean;
  comment: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
