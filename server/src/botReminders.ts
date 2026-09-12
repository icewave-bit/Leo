import type { PoolClient } from 'pg';
import { query } from './db.js';
import { computeWalletChargeAmount } from './lessonBalance.js';
import { toBotPersonalEvent, type LessonRow, type PersonalEventRow } from './mappers.js';
import { topUpRecurringPersonalSchedules } from './personalRecurringSchedule.js';
import { topUpRecurringSchedules } from './recurringSchedule.js';
import type { AcademicUnits, BalanceKind } from './types.js';

export const STUDENT_REMINDER_LEAD_MINUTES = 30;

export type DueReminderKind = 'lesson' | 'personal' | 'reschedule';
export type DueReminderRole = 'tutor' | 'student';
export type SentReminderKind = 'lesson' | 'personal';

export type DueLesson = {
  id: string;
  startUtc: string;
  durationMin: number;
  status: string;
  studentName: string;
  meetUrl: string | null;
  unpaid: boolean;
};

export type DuePersonalEvent = {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  startUtc: string;
  durationMin: number;
};

export type DueReschedule = {
  id: string;
  lessonId: string;
  fromStartUtc: string;
  toStartUtc: string;
  studentName: string;
  charged: boolean;
  meetUrl: string | null;
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
  reschedule?: DueReschedule;
};

type ReschedulePayload = {
  fromStartUtc: string;
  toStartUtc: string;
  studentName: string;
  charged: boolean;
  meetUrl: string | null;
  timezone: string;
  silent: boolean;
};

type OutboxRecipient = {
  telegramUserId: string | null;
  notifyEnabled: boolean;
  notifyLessons: boolean;
  silent: boolean;
  timezone: string;
  studentTelegramUserId: string | null;
  studentName: string;
  meetUrl: string | null;
  archived: boolean;
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
  is_group: boolean;
  student_rate: string | null;
  wallet_prepaid: string;
  wallet_debt: string;
  wallet_balance_kind: BalanceKind;
  wallet_rate: string | null;
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

function lessonReminderUnpaid(row: DueLessonRow): boolean {
  if (row.is_group) return false;
  const charge = computeWalletChargeAmount(
    row.wallet_balance_kind,
    row.wallet_rate != null ? Number(row.wallet_rate) : null,
    row.student_rate != null ? Number(row.student_rate) : null,
    row.academic_units as AcademicUnits,
  );
  if (charge == null || charge <= 0) return false;
  return Number(row.wallet_prepaid) - Number(row.wallet_debt) < charge;
}

function toDueLesson(row: DueLessonRow): DueLesson {
  return {
    id: row.id,
    startUtc: row.start_utc.toISOString(),
    durationMin: row.duration_min,
    status: row.status,
    studentName: row.student_name,
    meetUrl: row.meet_url,
    unpaid: lessonReminderUnpaid(row),
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
            s.name AS student_name, s.meet_url, s.is_group,
            s.rate AS student_rate,
            w.prepaid AS wallet_prepaid, w.debt AS wallet_debt,
            w.balance_kind AS wallet_balance_kind, w.rate AS wallet_rate
     FROM lessons l
     JOIN tutors t ON t.id = l.tutor_id
     JOIN students s ON s.id = l.student_id
     JOIN students w ON w.id = COALESCE(s.billing_student_id, s.id)
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
            s.name AS student_name, s.meet_url, s.is_group,
            s.rate AS student_rate,
            w.prepaid AS wallet_prepaid, w.debt AS wallet_debt,
            w.balance_kind AS wallet_balance_kind, w.rate AS wallet_rate
     FROM lessons l
     JOIN tutors t ON t.id = l.tutor_id
     JOIN students s ON s.id = l.student_id
     JOIN students w ON w.id = COALESCE(s.billing_student_id, s.id)
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
  const [tutorLessons, studentLessons, personal, reschedules] = await Promise.all([
    listDueTutorLessons(now),
    listDueStudentLessons(now),
    listDuePersonalEvents(now),
    listDueReschedules(),
  ]);
  const timed = [...tutorLessons, ...studentLessons, ...personal].sort((a, b) => {
    const aStart = a.lesson?.startUtc ?? a.event?.startUtc ?? '';
    const bStart = b.lesson?.startUtc ?? b.event?.startUtc ?? '';
    return aStart.localeCompare(bStart);
  });
  return [...reschedules, ...timed];
}

export async function markRemindersSent(items: SentReminder[]): Promise<void> {
  for (const item of items) {
    if (item.kind === 'reschedule') {
      await query(
        `DELETE FROM telegram_notification_outbox
         WHERE id = $1 AND telegram_user_id = $2 AND kind = 'reschedule'`,
        [item.entityId, item.telegramUserId],
      );
      continue;
    }
    await query(
      `INSERT INTO telegram_sent_reminders (telegram_user_id, kind, entity_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [item.telegramUserId, item.kind, item.entityId],
    );
  }
}

export async function clearSentRemindersForEntity(
  client: PoolClient,
  kind: SentReminderKind,
  entityId: string,
): Promise<void> {
  await client.query(`DELETE FROM telegram_sent_reminders WHERE kind = $1 AND entity_id = $2`, [
    kind,
    entityId,
  ]);
}

export async function enqueueLessonRescheduleNotices(
  client: PoolClient,
  input: {
    lessonId: string;
    fromStartUtc: Date;
    toStartUtc: Date;
    charged: boolean;
  },
): Promise<void> {
  const loaded = await client.query<OutboxRecipient>(
    `SELECT t.telegram_user_id::text AS "telegramUserId",
            t.telegram_notify_enabled AS "notifyEnabled",
            t.telegram_notify_lessons AS "notifyLessons",
            t.telegram_notify_silent AS silent,
            t.timezone,
            s.telegram_user_id::text AS "studentTelegramUserId",
            s.name AS "studentName",
            s.meet_url AS "meetUrl",
            (s.archived_at IS NOT NULL) AS archived
     FROM lessons l
     JOIN tutors t ON t.id = l.tutor_id
     JOIN students s ON s.id = l.student_id
     WHERE l.id = $1`,
    [input.lessonId],
  );
  const row = loaded.rows[0];
  if (!row) return;

  const payload: ReschedulePayload = {
    fromStartUtc: input.fromStartUtc.toISOString(),
    toStartUtc: input.toStartUtc.toISOString(),
    studentName: row.studentName,
    charged: input.charged,
    meetUrl: row.meetUrl,
    timezone: row.timezone,
    silent: row.silent,
  };

  const recipients: Array<{ telegramUserId: string; role: DueReminderRole; silent: boolean }> = [];
  if (row.telegramUserId && row.notifyEnabled && row.notifyLessons) {
    recipients.push({ telegramUserId: row.telegramUserId, role: 'tutor', silent: row.silent });
  }
  if (row.studentTelegramUserId && !row.archived) {
    recipients.push({
      telegramUserId: row.studentTelegramUserId,
      role: 'student',
      silent: false,
    });
  }

  const seen = new Set<string>();
  for (const recipient of recipients) {
    if (seen.has(recipient.telegramUserId)) continue;
    seen.add(recipient.telegramUserId);
    await client.query(
      `INSERT INTO telegram_notification_outbox (kind, telegram_user_id, role, entity_id, payload)
       VALUES ('reschedule', $1, $2, $3, $4::jsonb)`,
      [
        recipient.telegramUserId,
        recipient.role,
        input.lessonId,
        JSON.stringify({ ...payload, silent: recipient.silent }),
      ],
    );
  }
}

type OutboxRow = {
  id: string;
  telegram_user_id: string;
  role: DueReminderRole;
  entity_id: string;
  payload: ReschedulePayload;
};

async function listDueReschedules(): Promise<DueReminder[]> {
  const result = await query<OutboxRow>(
    `SELECT id, telegram_user_id::text AS telegram_user_id, role, entity_id, payload
     FROM telegram_notification_outbox
     WHERE kind = 'reschedule'
     ORDER BY created_at, id`,
  );
  return result.rows.map((row) => {
    const payload = row.payload;
    return {
      kind: 'reschedule' as const,
      telegramUserId: parseTelegramUserId(row.telegram_user_id),
      role: row.role,
      timezone: payload.timezone,
      leadMinutes: 0,
      silent: payload.silent,
      reschedule: {
        id: row.id,
        lessonId: row.entity_id,
        fromStartUtc: payload.fromStartUtc,
        toStartUtc: payload.toStartUtc,
        studentName: payload.studentName,
        charged: payload.charged,
        meetUrl: payload.meetUrl,
      },
    };
  });
}
