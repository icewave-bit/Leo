export type LessonStatus = 'planned' | 'completed' | 'cancelled' | 'no_show';
export type LessonType = 'solo' | 'group';
export type BalanceKind = 'money' | 'lessons';
export type WeekStartsOn = 'monday' | 'sunday';
export type AcademicUnits = 1 | 2;

export interface Tutor {
  id: string;
  email: string;
  name: string;
  initials: string;
  subject: string | null;
  timezone: string;
  academicHourMin: number;
  weekStartsOn: WeekStartsOn;
  createdAt: string;
}

export type PatchTutorBody = {
  academicHourMin?: number;
  weekStartsOn?: WeekStartsOn;
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
  createdAt: string;
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
};

export type UpdateStudentBody = Partial<CreateStudentBody>;

export type BalanceMovementKind =
  | 'replenish'
  | 'manual'
  | 'lesson_charge'
  | 'lesson_paid'
  | 'lesson_reverse';

export interface BalanceMovement {
  id: string;
  studentId: string;
  lessonId: string | null;
  occurredAt: string;
  kind: BalanceMovementKind;
  prepaidDelta: number;
  debtDelta: number;
  prepaidAfter: number;
  debtAfter: number;
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

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
