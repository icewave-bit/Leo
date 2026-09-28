import type { PoolClient } from 'pg';
import { query } from './db.js';
import { computeWalletChargeAmount } from './lessonBalance.js';
import { toBotPersonalEvent, type LessonRow, type PersonalEventRow } from './mappers.js';
import { topUpRecurringPersonalSchedules } from './personalRecurringSchedule.js';
import { topUpRecurringSchedules } from './recurringSchedule.js';
import type { AcademicUnits, BalanceKind, WeekStartsOn } from './types.js';

export const STUDENT_REMINDER_LEAD_MINUTES = 30;

export type DueReminderKind = 'lesson' | 'personal' | 'reschedule' | 'created' | 'deleted';
export type DueReminderRole = 'tutor' | 'student';
export type SentReminderKind = 'lesson' | 'personal';
export type OutboxKind = 'reschedule' | 'created' | 'deleted';

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

export type RescheduleSeriesSlot = {
  weekdays: number[];
  startMinutes: number;
};

export type DueReschedule = {
  id: string;
  lessonId: string;
  fromStartUtc: string;
  toStartUtc: string;
  studentName: string;
  charged: boolean;
  meetUrl: string | null;
  series?: RescheduleSeriesSlot[];
};

export type DueCreated = {
  id: string;
  lessonId: string;
  startUtc: string;
  studentName: string;
  meetUrl: string | null;
  series?: RescheduleSeriesSlot[];
};

export type DueDeleted = {
  id: string;
  lessonId: string;
  startUtc: string;
  studentName: string;
  charged: boolean;
  cancelFollowing?: boolean;
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
  created?: DueCreated;
  deleted?: DueDeleted;
};

type ReschedulePayload = {
  fromStartUtc: string;
  toStartUtc: string;
  studentName: string;
  charged: boolean;
  meetUrl: string | null;
  timezone: string;
  silent: boolean;
  series?: RescheduleSeriesSlot[];
};

type CreatedPayload = {
  startUtc: string;
  studentName: string;
  meetUrl: string | null;
  timezone: string;
  silent: boolean;
  series?: RescheduleSeriesSlot[];
};

type DeletedPayload = {
  startUtc: string;
  studentName: string;
  timezone: string;
  silent: boolean;
  charged: boolean;
  cancelFollowing?: boolean;
};

type OutboxRecipient = {
  telegramUserId: string | null;
  notifyEnabled: boolean;
  notifyLessons: boolean;
  silent: boolean;
  timezone: string;
  leadMinutes: number;
  startUtc: Date;
  recurringScheduleId: string | null;
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
  const [tutorLessons, studentLessons, personal, outbox] = await Promise.all([
    listDueTutorLessons(now),
    listDueStudentLessons(now),
    listDuePersonalEvents(now),
    listDueOutbox(now),
  ]);
  const timed = [...tutorLessons, ...studentLessons, ...personal].sort((a, b) => {
    const aStart = a.lesson?.startUtc ?? a.event?.startUtc ?? '';
    const bStart = b.lesson?.startUtc ?? b.event?.startUtc ?? '';
    return aStart.localeCompare(bStart);
  });
  return [...outbox, ...timed];
}

export async function markRemindersSent(items: SentReminder[]): Promise<void> {
  for (const item of items) {
    if (item.kind === 'reschedule' || item.kind === 'created' || item.kind === 'deleted') {
      await query(
        `DELETE FROM telegram_notification_outbox
         WHERE id = $1 AND telegram_user_id = $2 AND kind = $3`,
        [item.entityId, item.telegramUserId, item.kind],
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

function isRescheduleJoinWindow(toStartUtc: Date, now: Date): boolean {
  const remainingMs = toStartUtc.getTime() - now.getTime();
  return remainingMs > 0 && remainingMs <= STUDENT_REMINDER_LEAD_MINUTES * 60_000;
}

function toMondayWeekdays(weekdays: number[], weekStartsOn: WeekStartsOn): number[] {
  const shift = weekStartsOn === 'sunday' ? 6 : 0;
  return [...new Set(weekdays.map((day) => (day + shift) % 7))].sort((a, b) => a - b);
}

function mergeSeriesSlots(
  rows: Array<{ weekdays: number[]; start_minutes: number; week_starts_on: WeekStartsOn }>,
): RescheduleSeriesSlot[] {
  const byTime = new Map<number, Set<number>>();
  for (const row of rows) {
    let days = byTime.get(row.start_minutes);
    if (!days) {
      days = new Set();
      byTime.set(row.start_minutes, days);
    }
    for (const day of toMondayWeekdays(row.weekdays, row.week_starts_on)) {
      days.add(day);
    }
  }
  return [...byTime.entries()]
    .map(([startMinutes, days]) => ({
      startMinutes,
      weekdays: [...days].sort((a, b) => a - b),
    }))
    .sort(
      (a, b) =>
        (a.weekdays[0] ?? 0) - (b.weekdays[0] ?? 0) || a.startMinutes - b.startMinutes,
    );
}

async function loadStudentSeriesSlots(
  client: PoolClient,
  lessonId: string,
): Promise<RescheduleSeriesSlot[]> {
  const result = await client.query<{
    weekdays: number[];
    start_minutes: number;
    week_starts_on: WeekStartsOn;
  }>(
    `SELECT rs.weekdays, rs.start_minutes, t.week_starts_on
     FROM lessons l
     JOIN tutors t ON t.id = l.tutor_id
     JOIN recurring_schedules rs
       ON rs.tutor_id = l.tutor_id AND rs.student_id = l.student_id
     WHERE l.id = $1
       AND rs.active = true
       AND (rs.end_date IS NULL OR rs.end_date >= (now() AT TIME ZONE t.timezone)::date)
     ORDER BY rs.start_minutes, rs.id`,
    [lessonId],
  );
  return mergeSeriesSlots(result.rows);
}

async function loadOutboxContext(
  client: PoolClient,
  lessonId: string,
): Promise<OutboxRecipient | undefined> {
  const loaded = await client.query<OutboxRecipient>(
    `SELECT t.telegram_user_id::text AS "telegramUserId",
            t.telegram_notify_enabled AS "notifyEnabled",
            t.telegram_notify_lessons AS "notifyLessons",
            t.telegram_notify_silent AS silent,
            t.timezone,
            t.telegram_notify_lead_minutes AS "leadMinutes",
            l.start_utc AS "startUtc",
            l.recurring_schedule_id::text AS "recurringScheduleId",
            s.telegram_user_id::text AS "studentTelegramUserId",
            s.name AS "studentName",
            s.meet_url AS "meetUrl",
            (s.archived_at IS NOT NULL) AS archived
     FROM lessons l
     JOIN tutors t ON t.id = l.tutor_id
     JOIN students s ON s.id = l.student_id
     WHERE l.id = $1`,
    [lessonId],
  );
  return loaded.rows[0];
}

function outboxRecipients(
  row: OutboxRecipient,
): Array<{ telegramUserId: string; role: DueReminderRole; silent: boolean; leadMinutes: number }> {
  const recipients: Array<{
    telegramUserId: string;
    role: DueReminderRole;
    silent: boolean;
    leadMinutes: number;
  }> = [];
  if (row.telegramUserId && row.notifyEnabled && row.notifyLessons) {
    recipients.push({
      telegramUserId: row.telegramUserId,
      role: 'tutor',
      silent: row.silent,
      leadMinutes: row.leadMinutes,
    });
  }
  if (row.studentTelegramUserId && !row.archived) {
    recipients.push({
      telegramUserId: row.studentTelegramUserId,
      role: 'student',
      silent: false,
      leadMinutes: STUDENT_REMINDER_LEAD_MINUTES,
    });
  }
  return recipients;
}

function inLeadWindow(startUtc: Date, now: Date, leadMinutes: number): boolean {
  const remainingMs = startUtc.getTime() - now.getTime();
  return remainingMs > 0 && remainingMs <= leadMinutes * 60_000;
}

async function insertOutboxNotices(
  client: PoolClient,
  input: {
    kind: OutboxKind;
    lessonId: string;
    payload: Record<string, unknown>;
    markLessonSent: (recipientLeadMinutes: number) => boolean;
    recipients: Array<{
      telegramUserId: string;
      role: DueReminderRole;
      silent: boolean;
      leadMinutes: number;
    }>;
  },
): Promise<void> {
  const seen = new Set<string>();
  for (const recipient of input.recipients) {
    if (seen.has(recipient.telegramUserId)) continue;
    seen.add(recipient.telegramUserId);
    await client.query(
      `INSERT INTO telegram_notification_outbox (kind, telegram_user_id, role, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        input.kind,
        recipient.telegramUserId,
        recipient.role,
        input.lessonId,
        JSON.stringify({ ...input.payload, silent: recipient.silent }),
      ],
    );
    if (input.markLessonSent(recipient.leadMinutes)) {
      await client.query(
        `INSERT INTO telegram_sent_reminders (telegram_user_id, kind, entity_id)
         VALUES ($1, 'lesson', $2)
         ON CONFLICT DO NOTHING`,
        [recipient.telegramUserId, input.lessonId],
      );
    }
  }
}

export async function enqueueLessonCreatedNotices(
  client: PoolClient,
  input: {
    lessonId: string;
    includeSeries?: boolean;
  },
): Promise<void> {
  const row = await loadOutboxContext(client, input.lessonId);
  if (!row) return;
  const now = new Date();
  if (row.startUtc.getTime() <= now.getTime()) return;

  const series = input.includeSeries ? await loadStudentSeriesSlots(client, input.lessonId) : [];
  const payload: CreatedPayload = {
    startUtc: row.startUtc.toISOString(),
    studentName: row.studentName,
    meetUrl: row.meetUrl,
    timezone: row.timezone,
    silent: row.silent,
    ...(series.length > 0 ? { series } : {}),
  };
  await insertOutboxNotices(client, {
    kind: 'created',
    lessonId: input.lessonId,
    payload,
    markLessonSent: (leadMinutes) => inLeadWindow(row.startUtc, now, leadMinutes),
    recipients: outboxRecipients(row),
  });
}

export async function enqueueLessonRescheduleNotices(
  client: PoolClient,
  input: {
    lessonId: string;
    fromStartUtc: Date;
    toStartUtc: Date;
    charged: boolean;
    includeSeries?: boolean;
  },
): Promise<void> {
  const row = await loadOutboxContext(client, input.lessonId);
  if (!row) return;

  await client.query(
    `DELETE FROM telegram_notification_outbox WHERE kind = 'created' AND entity_id = $1`,
    [input.lessonId],
  );

  const series = input.includeSeries ? await loadStudentSeriesSlots(client, input.lessonId) : [];
  const payload: ReschedulePayload = {
    fromStartUtc: input.fromStartUtc.toISOString(),
    toStartUtc: input.toStartUtc.toISOString(),
    studentName: row.studentName,
    charged: input.charged,
    meetUrl: row.meetUrl,
    timezone: row.timezone,
    silent: row.silent,
    ...(series.length > 0 ? { series } : {}),
  };
  const now = new Date();
  await insertOutboxNotices(client, {
    kind: 'reschedule',
    lessonId: input.lessonId,
    payload,
    markLessonSent: () => isRescheduleJoinWindow(input.toStartUtc, now),
    recipients: outboxRecipients(row),
  });
}

export async function enqueueLessonDeletedNotices(
  client: PoolClient,
  input: {
    lessonId: string;
    includeSeries?: boolean;
    charged: boolean;
  },
): Promise<void> {
  const row = await loadOutboxContext(client, input.lessonId);
  if (!row) return;
  const now = new Date();

  const relatedIds = [input.lessonId];
  if (input.includeSeries && row.recurringScheduleId) {
    const related = await client.query<{ id: string }>(
      `SELECT id FROM lessons
       WHERE recurring_schedule_id = $1 AND start_utc >= $2`,
      [row.recurringScheduleId, row.startUtc.toISOString()],
    );
    for (const lesson of related.rows) {
      if (!relatedIds.includes(lesson.id)) relatedIds.push(lesson.id);
    }
  }

  const displayStart = input.includeSeries
    ? await firstFutureDeletedStart(client, relatedIds, now, row.startUtc)
    : row.startUtc;
  if (displayStart.getTime() <= now.getTime() && !input.charged) return;

  await client.query(
    `DELETE FROM telegram_notification_outbox
     WHERE kind IN ('created', 'reschedule') AND entity_id = ANY($1::uuid[])`,
    [relatedIds],
  );

  const payload: DeletedPayload = {
    startUtc: displayStart.toISOString(),
    studentName: row.studentName,
    timezone: row.timezone,
    silent: row.silent,
    charged: input.charged,
    ...(input.includeSeries ? { cancelFollowing: true } : {}),
  };
  await insertOutboxNotices(client, {
    kind: 'deleted',
    lessonId: input.lessonId,
    payload,
    markLessonSent: () => false,
    recipients: outboxRecipients(row),
  });
}

async function firstFutureDeletedStart(
  client: PoolClient,
  lessonIds: string[],
  now: Date,
  fallback: Date,
): Promise<Date> {
  const result = await client.query<{ start_utc: Date }>(
    `SELECT start_utc FROM lessons
     WHERE id = ANY($1::uuid[]) AND start_utc > $2
     ORDER BY start_utc
     LIMIT 1`,
    [lessonIds, now.toISOString()],
  );
  return result.rows[0]?.start_utc ?? fallback;
}

type OutboxRow = {
  id: string;
  kind: OutboxKind;
  telegram_user_id: string;
  role: DueReminderRole;
  entity_id: string;
  payload: ReschedulePayload | CreatedPayload | DeletedPayload;
};

async function listDueOutbox(now: Date): Promise<DueReminder[]> {
  const result = await query<OutboxRow>(
    `SELECT id, kind, telegram_user_id::text AS telegram_user_id, role, entity_id, payload
     FROM telegram_notification_outbox
     WHERE kind IN ('reschedule', 'created', 'deleted')
     ORDER BY created_at, id`,
  );
  return result.rows.map((row) => {
    if (row.kind === 'created') {
      const payload = row.payload as CreatedPayload;
      const start = new Date(payload.startUtc);
      const series = payload.series && payload.series.length > 0 ? payload.series : undefined;
      return {
        kind: 'created' as const,
        telegramUserId: parseTelegramUserId(row.telegram_user_id),
        role: row.role,
        timezone: payload.timezone,
        leadMinutes: 0,
        silent: payload.silent,
        created: {
          id: row.id,
          lessonId: row.entity_id,
          startUtc: payload.startUtc,
          studentName: payload.studentName,
          meetUrl: isRescheduleJoinWindow(start, now) ? payload.meetUrl : null,
          ...(series ? { series } : {}),
        },
      };
    }
    if (row.kind === 'deleted') {
      const payload = row.payload as DeletedPayload;
      return {
        kind: 'deleted' as const,
        telegramUserId: parseTelegramUserId(row.telegram_user_id),
        role: row.role,
        timezone: payload.timezone,
        leadMinutes: 0,
        silent: payload.silent,
        deleted: {
          id: row.id,
          lessonId: row.entity_id,
          startUtc: payload.startUtc,
          studentName: payload.studentName,
          charged: payload.charged,
          ...(payload.cancelFollowing ? { cancelFollowing: true } : {}),
        },
      };
    }
    const payload = row.payload as ReschedulePayload;
    const toStart = new Date(payload.toStartUtc);
    const series = payload.series && payload.series.length > 0 ? payload.series : undefined;
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
        meetUrl: isRescheduleJoinWindow(toStart, now) ? payload.meetUrl : null,
        ...(series ? { series } : {}),
      },
    };
  });
}
