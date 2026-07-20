import type {
  AcademicUnits,
  BalanceKind,
  Lesson,
  LessonStatus,
  LessonType,
  PersonalEvent,
  PersonalEventGroup,
  PersonalEventOutline,
  RecurringPersonalSchedule,
  RecurringSchedule,
  Student,
  TaxDisplayCurrency,
  TelegramNotifyLeadMinutes,
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
  default_replenish_balance_kind: BalanceKind;
  tax_rate_percent: string;
  tax_display_currency: TaxDisplayCurrency;
  hidden_weekdays: number[];
  default_block_start_minutes: number;
  default_block_end_minutes: number;
  personal_event_outline: PersonalEventOutline;
  telegram_user_id: string | null;
  telegram_username: string | null;
  telegram_notify_enabled: boolean;
  telegram_notify_lead_minutes: number;
  telegram_notify_silent: boolean;
  telegram_notify_lessons: boolean;
  telegram_notify_personal: boolean;
  telegram_notify_personal_group_ids: string[];
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
  exclude_from_taxes: boolean;
  billing_student_id: string | null;
  archived_at: Date | null;
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
    defaultReplenishBalanceKind: row.default_replenish_balance_kind,
    taxRatePercent: Number(row.tax_rate_percent),
    taxDisplayCurrency: row.tax_display_currency,
    hiddenWeekdays: row.hidden_weekdays ?? [],
    defaultBlockStartMinutes: row.default_block_start_minutes,
    defaultBlockEndMinutes: row.default_block_end_minutes,
    personalEventOutline: row.personal_event_outline,
    telegramLinked: row.telegram_user_id != null,
    telegramUsername: row.telegram_username,
    telegramNotify: {
      enabled: row.telegram_notify_enabled,
      leadMinutes: row.telegram_notify_lead_minutes as TelegramNotifyLeadMinutes,
      silent: row.telegram_notify_silent,
      lessons: row.telegram_notify_lessons,
      personal: row.telegram_notify_personal,
      personalGroupIds: row.telegram_notify_personal_group_ids ?? [],
    },
    createdAt: toIsoUtc(row.created_at),
  };
}

export function toStudent(row: StudentRow, openLessonDebt = 0): Student {
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
    excludeFromTaxes: row.exclude_from_taxes,
    billingStudentId: row.billing_student_id,
    openLessonDebt,
    archivedAt: row.archived_at ? toIsoUtc(row.archived_at) : null,
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

interface PersonalEventGroupRow {
  id: string;
  tutor_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

interface PersonalEventRow {
  id: string;
  tutor_id: string;
  group_id: string;
  title: string;
  start_utc: Date;
  duration_min: number;
  notes: string | null;
  recurring_personal_schedule_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RecurringPersonalScheduleRow {
  id: string;
  tutor_id: string;
  group_id: string;
  title: string;
  weekdays: number[];
  start_minutes: number;
  duration_min: number;
  notes: string | null;
  interval_weeks: number;
  start_date: string;
  end_date: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function toPersonalEventGroup(row: PersonalEventGroupRow): PersonalEventGroup {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: toIsoUtc(row.created_at),
    updatedAt: toIsoUtc(row.updated_at),
  };
}

export function toPersonalEvent(row: PersonalEventRow): PersonalEvent {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    groupId: row.group_id,
    title: row.title,
    startUtc: toIsoUtc(row.start_utc),
    durationMin: row.duration_min,
    notes: row.notes,
    recurringPersonalScheduleId: row.recurring_personal_schedule_id,
    createdAt: toIsoUtc(row.created_at),
    updatedAt: toIsoUtc(row.updated_at),
  };
}

interface BotPersonalEventRow extends PersonalEventRow {
  group_name: string;
}

export function toBotPersonalEvent(row: BotPersonalEventRow) {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    title: row.title,
    startUtc: toIsoUtc(row.start_utc),
    durationMin: row.duration_min,
  };
}

export function toRecurringPersonalSchedule(
  row: RecurringPersonalScheduleRow,
): RecurringPersonalSchedule {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    groupId: row.group_id,
    title: row.title,
    weekdays: row.weekdays,
    startMinutes: row.start_minutes,
    durationMin: row.duration_min,
    notes: row.notes,
    intervalWeeks: row.interval_weeks,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active,
    createdAt: toIsoUtc(row.created_at),
    updatedAt: toIsoUtc(row.updated_at),
  };
}

export type {
  TutorRow,
  StudentRow,
  LessonRow,
  RecurringScheduleRow,
  PersonalEventGroupRow,
  PersonalEventRow,
  RecurringPersonalScheduleRow,
};
