import { query } from './db.js';
import { toBotPersonalEvent, type LessonRow, type PersonalEventRow } from './mappers.js';
import { topUpRecurringPersonalSchedules } from './personalRecurringSchedule.js';
import { topUpRecurringSchedules } from './recurringSchedule.js';

export const STUDENT_REMINDER_LEAD_MINUTES = 30;

export type DueReminderKind = 'lesson' | 'personal';
export type DueReminderRole = 'tutor' | 'student';

export type DueLesson = {
  id: string;
  startUtc: string;
  durationMin: number;
  status: string;
  studentName: string;
  meetUrl: string | null;
};

export type DuePersonalEvent = {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  startUtc: string;
  durationMin: number;
};

export type DueReminder = {
  kind: DueReminderKind;
  telegramUserId: number;
  role: DueReminderRole;
  timezone: string;
  leadMinutes: number;
  silent: boolean;
  lesson?: DueLesson;
  event?: DuePersonalEvent;
};

export type SentReminder = {
  telegramUserId: number;
  kind: DueReminderKind;
  entityId: string;
};

type DueLessonRow = LessonRow & {
  telegram_user_id: string;
  timezone: string;
  lead_minutes: number;
  silent: boolean;
  student_name: string;
  meet_url: string | null;
};

type DuePersonalRow = PersonalEventRow & {
  telegram_user_id: string;
  timezone: string;
  lead_minutes: number;
  silent: boolean;
  group_name: string;
};

function parseTelegramUserId(raw: string): number {
  return Number(raw);
}

function toDueLesson(row: DueLessonRow): DueLesson {
  return {
    id: row.id,
    startUtc: row.start_utc.toISOString(),
    durationMin: row.duration_min,
    status: row.status,
    studentName: row.student_name,
    meetUrl: row.meet_url,
  };
}

function toTutorLessonReminder(row: DueLessonRow): DueReminder {
  return {
    kind: 'lesson',
    telegramUserId: parseTelegramUserId(row.telegram_user_id),
    role: 'tutor',
    timezone: row.timezone,
    leadMinutes: row.lead_minutes,
    silent: row.silent,
    lesson: toDueLesson(row),
  };
}

function toStudentLessonReminder(row: DueLessonRow): DueReminder {
  return {
    kind: 'lesson',
    telegramUserId: parseTelegramUserId(row.telegram_user_id),
    role: 'student',
    timezone: row.timezone,
    leadMinutes: row.lead_minutes,
    silent: row.silent,
    lesson: toDueLesson(row),
  };
}

function toPersonalReminder(row: DuePersonalRow): DueReminder {
  return {
    kind: 'personal',
    telegramUserId: parseTelegramUserId(row.telegram_user_id),
    role: 'tutor',
    timezone: row.timezone,
    leadMinutes: row.lead_minutes,
    silent: row.silent,
    event: toBotPersonalEvent(row),
  };
}

async function topUpForDueReminders(): Promise<void> {
  const tutors = await query<{ id: string; telegram_notify_personal: boolean }>(
    `SELECT DISTINCT t.id, t.telegram_notify_personal
     FROM tutors t
     WHERE (t.telegram_user_id IS NOT NULL AND t.telegram_notify_enabled)
        OR EXISTS (
          SELECT 1 FROM students s
          WHERE s.tutor_id = t.id
            AND s.telegram_user_id IS NOT NULL
            AND s.archived_at IS NULL
        )`,
  );
  for (const tutor of tutors.rows) {
    await topUpRecurringSchedules(tutor.id);
    if (tutor.telegram_notify_personal) {
      await topUpRecurringPersonalSchedules(tutor.id);
    }
  }
}

async function listDueTutorLessons(now: Date): Promise<DueReminder[]> {
  const result = await query<DueLessonRow>(
    `SELECT t.telegram_user_id::text AS telegram_user_id,
            t.timezone,
            t.telegram_notify_lead_minutes AS lead_minutes,
            t.telegram_notify_silent AS silent,
            l.id, l.tutor_id, l.student_id, l.start_utc, l.duration_min, l.academic_units,
            l.status, l.type, l.paid, l.notes, l.balance_charged, l.balance_paid_applied,
            l.charge_prepaid_delta, l.charge_debt_delta, l.recurring_schedule_id,
            l.created_at, l.updated_at,
            s.name AS student_name, s.meet_url
     FROM lessons l
     JOIN tutors t ON t.id = l.tutor_id
     JOIN students s ON s.id = l.student_id
     LEFT JOIN telegram_sent_reminders sr
       ON sr.telegram_user_id = t.telegram_user_id
      AND sr.kind = 'lesson'
      AND sr.entity_id = l.id
     WHERE t.telegram_user_id IS NOT NULL
       AND t.telegram_notify_enabled
       AND t.telegram_notify_lessons
       AND s.archived_at IS NULL
       AND l.status = 'planned'
       AND l.start_utc > $1::timestamptz
       AND l.start_utc <= $1::timestamptz + make_interval(mins => t.telegram_notify_lead_minutes)
       AND sr.entity_id IS NULL
     ORDER BY l.start_utc`,
    [now.toISOString()],
  );
  return result.rows.map(toTutorLessonReminder);
}

async function listDueStudentLessons(now: Date): Promise<DueReminder[]> {
  const result = await query<DueLessonRow>(
    `SELECT s.telegram_user_id::text AS telegram_user_id,
            t.timezone,
            $2::int AS lead_minutes,
            false AS silent,
            l.id, l.tutor_id, l.student_id, l.start_utc, l.duration_min, l.academic_units,
            l.status, l.type, l.paid, l.notes, l.balance_charged, l.balance_paid_applied,
            l.charge_prepaid_delta, l.charge_debt_delta, l.recurring_schedule_id,
            l.created_at, l.updated_at,
            s.name AS student_name, s.meet_url
     FROM lessons l
     JOIN tutors t ON t.id = l.tutor_id
     JOIN students s ON s.id = l.student_id
     LEFT JOIN telegram_sent_reminders sr
       ON sr.telegram_user_id = s.telegram_user_id
      AND sr.kind = 'lesson'
      AND sr.entity_id = l.id
     WHERE s.telegram_user_id IS NOT NULL
       AND s.archived_at IS NULL
       AND l.status = 'planned'
       AND l.start_utc > $1::timestamptz
       AND l.start_utc <= $1::timestamptz + make_interval(mins => $2::int)
       AND sr.entity_id IS NULL
     ORDER BY l.start_utc`,
    [now.toISOString(), STUDENT_REMINDER_LEAD_MINUTES],
  );
  return result.rows.map(toStudentLessonReminder);
}

async function listDuePersonalEvents(now: Date): Promise<DueReminder[]> {
  const result = await query<DuePersonalRow>(
    `SELECT t.telegram_user_id::text AS telegram_user_id,
            t.timezone,
            t.telegram_notify_lead_minutes AS lead_minutes,
            t.telegram_notify_silent AS silent,
            pe.id, pe.tutor_id, pe.group_id, pe.title, pe.start_utc, pe.duration_min, pe.notes,
            pe.recurring_personal_schedule_id, pe.created_at, pe.updated_at,
            peg.name AS group_name
     FROM personal_events pe
     JOIN tutors t ON t.id = pe.tutor_id
     JOIN personal_event_groups peg ON peg.id = pe.group_id
     LEFT JOIN telegram_sent_reminders sr
       ON sr.telegram_user_id = t.telegram_user_id
      AND sr.kind = 'personal'
      AND sr.entity_id = pe.id
     WHERE t.telegram_user_id IS NOT NULL
       AND t.telegram_notify_enabled
       AND t.telegram_notify_personal
       AND pe.start_utc > $1::timestamptz
       AND pe.start_utc <= $1::timestamptz + make_interval(mins => t.telegram_notify_lead_minutes)
       AND (
         cardinality(t.telegram_notify_personal_group_ids) = 0
         OR pe.group_id = ANY(t.telegram_notify_personal_group_ids)
       )
       AND sr.entity_id IS NULL
     ORDER BY pe.start_utc`,
    [now.toISOString()],
  );
  return result.rows.map(toPersonalReminder);
}

export async function listDueReminders(now = new Date()): Promise<DueReminder[]> {
  await topUpForDueReminders();
  const [tutorLessons, studentLessons, personal] = await Promise.all([
    listDueTutorLessons(now),
    listDueStudentLessons(now),
    listDuePersonalEvents(now),
  ]);
  return [...tutorLessons, ...studentLessons, ...personal].sort((a, b) => {
    const aStart = a.lesson?.startUtc ?? a.event?.startUtc ?? '';
    const bStart = b.lesson?.startUtc ?? b.event?.startUtc ?? '';
    return aStart.localeCompare(bStart);
  });
}

export async function markRemindersSent(items: SentReminder[]): Promise<void> {
  for (const item of items) {
    await query(
      `INSERT INTO telegram_sent_reminders (telegram_user_id, kind, entity_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [item.telegramUserId, item.kind, item.entityId],
    );
  }
}
