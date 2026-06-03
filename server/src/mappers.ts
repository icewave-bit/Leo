import type {
  AcademicUnits,
  BalanceKind,
  Lesson,
  LessonStatus,
  LessonType,
  RecurringSchedule,
  Student,
  Tutor,
  WeekStartsOn,
} from './types.js';

interface TutorRow {
  id: string;
  email: string;
  name: string;
  initials: string;
  subject: string | null;
  timezone: string;
  academic_hour_min: number;
  week_starts_on: WeekStartsOn;
  created_at: Date;
}

interface StudentRow {
  id: string;
  tutor_id: string;
  name: string;
  initials: string;
  hue: number;
  tz: string;
  meet_url: string | null;
  rate: string | null;
  currency: string;
  note: string | null;
  is_group: boolean;
  members: string[];
  balance_kind: BalanceKind;
  prepaid: string;
  debt: string;
  created_at: Date;
}

interface LessonRow {
  id: string;
  tutor_id: string;
  student_id: string;
  start_utc: Date;
  duration_min: number;
  academic_units: AcademicUnits;
  status: LessonStatus;
  type: LessonType;
  paid: boolean;
  notes: string | null;
  balance_charged: boolean;
  balance_paid_applied: boolean;
  charge_prepaid_delta: string;
  charge_debt_delta: string;
  recurring_schedule_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RecurringScheduleRow {
  id: string;
  tutor_id: string;
  student_id: string;
  weekdays: number[];
  start_minutes: number;
  duration_min: number;
  academic_units: AcademicUnits;
  type: LessonType;
  notes: string | null;
  interval_weeks: number;
  start_date: string;
  end_date: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toIsoUtc(d: Date): string {
  return d.toISOString();
}

export function toTutor(row: TutorRow): Tutor {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    initials: row.initials,
    subject: row.subject,
    timezone: row.timezone,
    academicHourMin: row.academic_hour_min,
    weekStartsOn: row.week_starts_on,
    createdAt: toIsoUtc(row.created_at),
  };
}

export function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    name: row.name,
    initials: row.initials,
    hue: row.hue,
    tz: row.tz,
    meetUrl: row.meet_url,
    rate: row.rate !== null ? Number(row.rate) : null,
    currency: row.currency,
    note: row.note,
    isGroup: row.is_group,
    members: row.members ?? [],
    balanceKind: row.balance_kind,
    prepaid: Number(row.prepaid),
    debt: Number(row.debt),
    createdAt: toIsoUtc(row.created_at),
  };
}

export function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    studentId: row.student_id,
    startUtc: toIsoUtc(row.start_utc),
    durationMin: row.duration_min,
    academicUnits: row.academic_units,
    status: row.status,
    type: row.type,
    paid: row.paid,
    notes: row.notes,
    balanceCharged: row.balance_charged,
    chargeDebtDelta: Number(row.charge_debt_delta),
    balancePaidApplied: row.balance_paid_applied,
    recurringScheduleId: row.recurring_schedule_id,
    createdAt: toIsoUtc(row.created_at),
    updatedAt: toIsoUtc(row.updated_at),
  };
}

export function toRecurringSchedule(row: RecurringScheduleRow): RecurringSchedule {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    studentId: row.student_id,
    weekdays: row.weekdays,
    startMinutes: row.start_minutes,
    durationMin: row.duration_min,
    academicUnits: row.academic_units,
    type: row.type,
    notes: row.notes,
    intervalWeeks: row.interval_weeks,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active,
    createdAt: toIsoUtc(row.created_at),
    updatedAt: toIsoUtc(row.updated_at),
  };
}

export type { TutorRow, StudentRow, LessonRow, RecurringScheduleRow };
