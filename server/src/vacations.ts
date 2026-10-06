import type { PoolClient } from 'pg';
import { getPool } from './db.js';
import { AppError } from './errors.js';
import type { CascadeTarget } from './activityLog.js';
import type { LessonRow, PersonalEventRow } from './mappers.js';
import {
  rematerializeRecurringPersonalScheduleById,
  skipRecurringPersonalOccurrence,
  unskipRecurringPersonalOccurrence,
} from './personalRecurringSchedule.js';
import {
  getTutorSchedulePrefs,
  rematerializeRecurringScheduleById,
  skipRecurringOccurrence,
  unskipRecurringOccurrence,
} from './recurringSchedule.js';
import {
  addDaysToDateOnly,
  dateKeyInTz,
  parseDateOnly,
  wallClockToUtc,
  zonedDayRangeUtc,
} from './scheduleSlots.js';
import { assertActiveStudentOwned } from './studentAccess.js';
import type { StudentVacation, Vacation } from './types.js';

export const VACATION_NOTIFY_DELAY_MS = 5 * 60 * 1000;

const LESSON_COLUMNS = `id, tutor_id, student_id, start_utc, duration_min, academic_units, status, type, paid, notes,
              balance_charged, balance_paid_applied, charge_prepaid_delta, charge_debt_delta,
              recurring_schedule_id, created_at, updated_at`;

const PERSONAL_COLUMNS = `id, tutor_id, group_id, title, start_utc, duration_min, notes,
  recurring_personal_schedule_id, created_at, updated_at`;

const VACATION_COLUMNS = `id, tutor_id, student_id, start_date::text AS start_date, end_date::text AS end_date,
  personal_group_ids, notify_at, notified_at, cancelled_at, created_at, updated_at`;

export type VacationRow = {
  id: string;
  tutor_id: string;
  student_id: string | null;
  start_date: string;
  end_date: string;
  personal_group_ids: string[];
  notify_at: Date;
  notified_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type HiddenItemRow = {
  id: string;
  vacation_id: string;
  kind: 'lesson' | 'personal_event';
  original_id: string;
  start_utc: Date;
  recurring_schedule_id: string | null;
  snapshot: Record<string, unknown>;
};

type TutorNotifyCtx = {
  timezone: string;
  telegramUserId: string | null;
  notifyEnabled: boolean;
  notifyLessons: boolean;
  silent: boolean;
};

type LinkedStudent = {
  id: string;
  name: string;
  telegramUserId: string;
};

export type VacationActivityDiff = {
  hiddenLessons: CascadeTarget[];
  hiddenEvents: CascadeTarget[];
  restoredLessons: CascadeTarget[];
  restoredEvents: CascadeTarget[];
};

export type VacationWriteResult = {
  vacation: Vacation;
} & VacationActivityDiff;

function emptyActivityDiff(): VacationActivityDiff {
  return {
    hiddenLessons: [],
    hiddenEvents: [],
    restoredLessons: [],
    restoredEvents: [],
  };
}

export type CreateVacationInput = {
  studentId?: string | null;
  startDate: string;
  endDate: string;
  personalGroupIds?: string[];
};

export type PatchVacationInput = {
  startDate?: string;
  endDate?: string;
  personalGroupIds?: string[];
};

type VacationNoticePayload = {
  scope: 'student' | 'tutor';
  studentName: string | null;
  startDate: string;
  endDate: string;
  removedStarts: string[];
  nextStartUtc: string | null;
  timezone: string;
  silent: boolean;
};

type VacationCancelledPayload = {
  scope: 'student' | 'tutor';
  studentName: string | null;
  restoredFromDate: string;
  timezone: string;
  silent: boolean;
};

function exclusiveEndUtc(endDate: string, timezone: string): Date {
  const next = addDaysToDateOnly(endDate, 1);
  const { year, month, day } = parseDateOnly(next);
  return wallClockToUtc(year, month, day, 0, 0, timezone);
}

function dateInInclusiveRange(dateKey: string, startDate: string, endDate: string): boolean {
  return dateKey >= startDate && dateKey <= endDate;
}

function jsonSafe(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

function snapshotStudentId(snapshot: Record<string, unknown>): string | null {
  const id = snapshot.student_id;
  return typeof id === 'string' ? id : null;
}

function snapshotGroupId(snapshot: Record<string, unknown>): string | null {
  const id = snapshot.group_id;
  return typeof id === 'string' ? id : null;
}

function lessonCovers(
  vacations: VacationRow[],
  dateKey: string,
  studentId: string,
): VacationRow[] {
  return vacations.filter(
    (vacation) =>
      dateInInclusiveRange(dateKey, vacation.start_date, vacation.end_date) &&
      (vacation.student_id == null || vacation.student_id === studentId),
  );
}

function personalCovers(
  vacations: VacationRow[],
  dateKey: string,
  groupId: string,
): VacationRow[] {
  return vacations.filter(
    (vacation) =>
      vacation.student_id == null &&
      dateInInclusiveRange(dateKey, vacation.start_date, vacation.end_date) &&
      vacation.personal_group_ids.includes(groupId),
  );
}

async function loadTutorNotify(client: PoolClient, tutorId: string): Promise<TutorNotifyCtx> {
  const result = await client.query<TutorNotifyCtx>(
    `SELECT timezone,
            telegram_user_id::text AS "telegramUserId",
            telegram_notify_enabled AS "notifyEnabled",
            telegram_notify_lessons AS "notifyLessons",
            telegram_notify_silent AS silent
     FROM tutors WHERE id = $1`,
    [tutorId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Tutor not found');
  }
  return row;
}

async function loadVacationRow(
  client: PoolClient,
  tutorId: string,
  vacationId: string,
  forUpdate = false,
): Promise<VacationRow> {
  const result = await client.query<VacationRow>(
    `SELECT ${VACATION_COLUMNS}
     FROM vacations
     WHERE id = $1 AND tutor_id = $2
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [vacationId, tutorId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Vacation not found');
  }
  return row;
}

function isOpenVacation(row: VacationRow, today: string): boolean {
  return row.cancelled_at == null && row.end_date >= today;
}

async function assertNoOpenVacation(
  client: PoolClient,
  tutorId: string,
  studentId: string | null,
  today: string,
  exceptId?: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM vacations
     WHERE tutor_id = $1
       AND cancelled_at IS NULL
       AND end_date >= $2::date
       AND student_id IS NOT DISTINCT FROM $3::uuid
       AND ($4::uuid IS NULL OR id <> $4)
     LIMIT 1`,
    [tutorId, today, studentId, exceptId ?? null],
  );
  if (result.rows[0]) {
    throw new AppError('CONFLICT', 409, 'An open vacation already exists');
  }
}

async function assertPersonalGroupsOwned(
  client: PoolClient,
  tutorId: string,
  groupIds: string[],
): Promise<void> {
  if (groupIds.length === 0) return;
  const unique = [...new Set(groupIds)];
  const result = await client.query<{ id: string }>(
    `SELECT id FROM personal_event_groups WHERE tutor_id = $1 AND id = ANY($2::uuid[])`,
    [tutorId, unique],
  );
  if (result.rows.length !== unique.length) {
    throw new AppError('VALIDATION', 400, 'Personal event group not found', {
      personalGroupIds: 'invalid',
    });
  }
}

async function loadOpenVacations(
  client: PoolClient,
  tutorId: string,
  today: string,
): Promise<VacationRow[]> {
  const result = await client.query<VacationRow>(
    `SELECT ${VACATION_COLUMNS}
     FROM vacations
     WHERE tutor_id = $1 AND cancelled_at IS NULL AND end_date >= $2::date
     ORDER BY start_date, id`,
    [tutorId, today],
  );
  return result.rows;
}

async function loadUnrestoredItems(client: PoolClient, tutorId: string): Promise<HiddenItemRow[]> {
  const result = await client.query<HiddenItemRow>(
    `SELECT h.id, h.vacation_id, h.kind, h.original_id, h.start_utc, h.recurring_schedule_id, h.snapshot
     FROM vacation_hidden_items h
     JOIN vacations v ON v.id = h.vacation_id
     WHERE v.tutor_id = $1 AND h.restored_at IS NULL`,
    [tutorId],
  );
  return result.rows;
}

async function deletePendingLessonNotices(client: PoolClient, lessonId: string): Promise<void> {
  await client.query(
    `DELETE FROM telegram_notification_outbox
     WHERE kind IN ('created', 'reschedule') AND entity_id = $1`,
    [lessonId],
  );
}

async function hideLesson(
  client: PoolClient,
  vacationId: string,
  lesson: LessonRow,
): Promise<void> {
  await client.query(
    `INSERT INTO vacation_hidden_items (
       vacation_id, kind, original_id, start_utc, recurring_schedule_id, snapshot
     ) VALUES ($1, 'lesson', $2, $3, $4, $5::jsonb)`,
    [
      vacationId,
      lesson.id,
      lesson.start_utc.toISOString(),
      lesson.recurring_schedule_id,
      JSON.stringify(jsonSafe(lesson)),
    ],
  );
  if (lesson.recurring_schedule_id) {
    await skipRecurringOccurrence(client, lesson.recurring_schedule_id, lesson.start_utc);
  }
  await deletePendingLessonNotices(client, lesson.id);
  await client.query(`DELETE FROM telegram_sent_reminders WHERE kind = 'lesson' AND entity_id = $1`, [
    lesson.id,
  ]);
  await client.query(`DELETE FROM lessons WHERE id = $1`, [lesson.id]);
}

async function hidePersonalEvent(
  client: PoolClient,
  vacationId: string,
  event: PersonalEventRow,
): Promise<void> {
  await client.query(
    `INSERT INTO vacation_hidden_items (
       vacation_id, kind, original_id, start_utc, recurring_schedule_id, snapshot
     ) VALUES ($1, 'personal_event', $2, $3, $4, $5::jsonb)`,
    [
      vacationId,
      event.id,
      event.start_utc.toISOString(),
      event.recurring_personal_schedule_id,
      JSON.stringify(jsonSafe(event)),
    ],
  );
  if (event.recurring_personal_schedule_id) {
    await skipRecurringPersonalOccurrence(
      client,
      event.recurring_personal_schedule_id,
      event.start_utc,
    );
  }
  await client.query(
    `DELETE FROM telegram_sent_reminders WHERE kind = 'personal' AND entity_id = $1`,
    [event.id],
  );
  await client.query(`DELETE FROM personal_events WHERE id = $1`, [event.id]);
}

async function restoreOneOffLesson(
  client: PoolClient,
  snapshot: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO lessons (
       id, tutor_id, student_id, start_utc, duration_min, academic_units,
       status, type, paid, notes, balance_charged, balance_paid_applied,
       charge_prepaid_delta, charge_debt_delta, recurring_schedule_id, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now()
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      snapshot.id,
      snapshot.tutor_id,
      snapshot.student_id,
      snapshot.start_utc,
      snapshot.duration_min,
      snapshot.academic_units,
      snapshot.status ?? 'planned',
      snapshot.type ?? 'solo',
      snapshot.paid ?? false,
      snapshot.notes ?? null,
      snapshot.balance_charged ?? false,
      snapshot.balance_paid_applied ?? false,
      snapshot.charge_prepaid_delta ?? 0,
      snapshot.charge_debt_delta ?? 0,
      null,
      snapshot.created_at ?? new Date().toISOString(),
    ],
  );
}

async function restoreOneOffPersonal(
  client: PoolClient,
  snapshot: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO personal_events (
       id, tutor_id, group_id, title, start_utc, duration_min, notes,
       recurring_personal_schedule_id, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (id) DO NOTHING`,
    [
      snapshot.id,
      snapshot.tutor_id,
      snapshot.group_id,
      snapshot.title,
      snapshot.start_utc,
      snapshot.duration_min,
      snapshot.notes ?? null,
      null,
      snapshot.created_at ?? new Date().toISOString(),
    ],
  );
}

async function markRestored(client: PoolClient, itemId: string): Promise<void> {
  await client.query(`UPDATE vacation_hidden_items SET restored_at = now() WHERE id = $1`, [itemId]);
}

async function recomputeHidden(
  client: PoolClient,
  tutorId: string,
  timezone: string,
  preferredVacationId: string | null,
  now: Date,
): Promise<VacationActivityDiff> {
  const today = dateKeyInTz(now, timezone);
  const startOfToday = zonedDayRangeUtc(now, timezone).from;
  const open = await loadOpenVacations(client, tutorId, today);
  const diff = emptyActivityDiff();

  const liveLessons = await client.query<LessonRow>(
    `SELECT ${LESSON_COLUMNS}
     FROM lessons
     WHERE tutor_id = $1 AND status = 'planned' AND start_utc > $2`,
    [tutorId, now.toISOString()],
  );
  const livePersonal = await client.query<PersonalEventRow>(
    `SELECT ${PERSONAL_COLUMNS}
     FROM personal_events
     WHERE tutor_id = $1 AND start_utc > $2`,
    [tutorId, now.toISOString()],
  );

  for (const lesson of liveLessons.rows) {
    const dateKey = dateKeyInTz(lesson.start_utc, timezone);
    const covering = lessonCovers(open, dateKey, lesson.student_id);
    if (covering.length === 0) continue;
    const owner =
      covering.find((row) => row.id === preferredVacationId) ??
      covering.find((row) => row.student_id === lesson.student_id) ??
      covering[0]!;
    await hideLesson(client, owner.id, lesson);
    diff.hiddenLessons.push({
      id: lesson.id,
      start_utc: lesson.start_utc,
      student_id: lesson.student_id,
    });
  }

  for (const event of livePersonal.rows) {
    const dateKey = dateKeyInTz(event.start_utc, timezone);
    const covering = personalCovers(open, dateKey, event.group_id);
    if (covering.length === 0) continue;
    const owner = covering.find((row) => row.id === preferredVacationId) ?? covering[0]!;
    await hidePersonalEvent(client, owner.id, event);
    diff.hiddenEvents.push({
      id: event.id,
      start_utc: event.start_utc,
      title: event.title,
    });
  }

  const stillHidden = await loadUnrestoredItems(client, tutorId);
  const lessonSchedules = new Set<string>();
  const personalSchedules = new Set<string>();

  for (const item of stillHidden) {
    const dateKey = dateKeyInTz(item.start_utc, timezone);
    const covering =
      item.kind === 'lesson'
        ? lessonCovers(open, dateKey, snapshotStudentId(item.snapshot) ?? '')
        : personalCovers(open, dateKey, snapshotGroupId(item.snapshot) ?? '');

    if (covering.length > 0) {
      const owner =
        covering.find((row) => row.id === preferredVacationId) ??
        covering.find((row) => row.id === item.vacation_id) ??
        covering[0]!;
      if (owner.id !== item.vacation_id) {
        await client.query(`UPDATE vacation_hidden_items SET vacation_id = $1 WHERE id = $2`, [
          owner.id,
          item.id,
        ]);
      }
      continue;
    }

    if (item.start_utc.getTime() < startOfToday.getTime()) continue;

    if (item.kind === 'lesson' && item.recurring_schedule_id) {
      await unskipRecurringOccurrence(client, item.recurring_schedule_id, item.start_utc);
      lessonSchedules.add(item.recurring_schedule_id);
      await markRestored(client, item.id);
      diff.restoredLessons.push({
        id: item.original_id,
        start_utc: item.start_utc,
        student_id: snapshotStudentId(item.snapshot) ?? undefined,
      });
      continue;
    }
    if (item.kind === 'personal_event' && item.recurring_schedule_id) {
      await unskipRecurringPersonalOccurrence(client, item.recurring_schedule_id, item.start_utc);
      personalSchedules.add(item.recurring_schedule_id);
      await markRestored(client, item.id);
      diff.restoredEvents.push({
        id: item.original_id,
        start_utc: item.start_utc,
        title: typeof item.snapshot.title === 'string' ? item.snapshot.title : undefined,
      });
      continue;
    }
    if (item.kind === 'lesson') {
      await restoreOneOffLesson(client, item.snapshot);
      diff.restoredLessons.push({
        id: item.original_id,
        start_utc: item.start_utc,
        student_id: snapshotStudentId(item.snapshot) ?? undefined,
      });
    } else {
      await restoreOneOffPersonal(client, item.snapshot);
      diff.restoredEvents.push({
        id: item.original_id,
        start_utc: item.start_utc,
        title: typeof item.snapshot.title === 'string' ? item.snapshot.title : undefined,
      });
    }
    await markRestored(client, item.id);
  }

  const prefs = await getTutorSchedulePrefs(tutorId);
  for (const scheduleId of lessonSchedules) {
    await rematerializeRecurringScheduleById(client, scheduleId, prefs);
  }
  for (const scheduleId of personalSchedules) {
    await rematerializeRecurringPersonalScheduleById(client, scheduleId, prefs);
  }
  return diff;
}

async function nextLessonStartUtc(
  client: PoolClient,
  tutorId: string,
  timezone: string,
  endDate: string,
  studentId: string | null,
): Promise<string | null> {
  const from = exclusiveEndUtc(endDate, timezone);
  const params: unknown[] = [tutorId, from.toISOString()];
  let studentFilter = '';
  if (studentId) {
    studentFilter = 'AND l.student_id = $3';
    params.push(studentId);
  }
  const result = await client.query<{ start_utc: Date }>(
    `SELECT l.start_utc
     FROM lessons l
     JOIN students s ON s.id = l.student_id
     WHERE l.tutor_id = $1
       AND l.status = 'planned'
       AND l.start_utc >= $2
       AND s.archived_at IS NULL
       ${studentFilter}
     ORDER BY l.start_utc
     LIMIT 1`,
    params,
  );
  return result.rows[0]?.start_utc.toISOString() ?? null;
}

async function removedStartsFor(
  client: PoolClient,
  tutorId: string,
  timezone: string,
  vacation: VacationRow,
  studentId: string | null,
): Promise<string[]> {
  const items = await loadUnrestoredItems(client, tutorId);
  return items
    .filter((item) => {
      if (item.kind !== 'lesson') return false;
      const dateKey = dateKeyInTz(item.start_utc, timezone);
      if (!dateInInclusiveRange(dateKey, vacation.start_date, vacation.end_date)) return false;
      if (studentId && snapshotStudentId(item.snapshot) !== studentId) return false;
      return true;
    })
    .map((item) => item.start_utc.toISOString())
    .sort();
}

async function toVacationDto(
  client: PoolClient,
  tutorId: string,
  timezone: string,
  row: VacationRow,
): Promise<Vacation> {
  const [removedLessonStarts, next] = await Promise.all([
    removedStartsFor(client, tutorId, timezone, row, row.student_id),
    nextLessonStartUtc(client, tutorId, timezone, row.end_date, row.student_id),
  ]);
  return {
    id: row.id,
    studentId: row.student_id,
    startDate: row.start_date,
    endDate: row.end_date,
    personalGroupIds: row.personal_group_ids ?? [],
    notifyAt: row.notify_at.toISOString(),
    notifiedAt: row.notified_at ? row.notified_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    removedLessonStarts,
    nextLessonStartUtc: next,
  };
}

async function loadStudentName(
  client: PoolClient,
  tutorId: string,
  studentId: string,
): Promise<string | null> {
  const result = await client.query<{ name: string }>(
    `SELECT name FROM students WHERE id = $1 AND tutor_id = $2`,
    [studentId, tutorId],
  );
  return result.rows[0]?.name ?? null;
}

async function loadLinkedStudents(client: PoolClient, tutorId: string): Promise<LinkedStudent[]> {
  const result = await client.query<LinkedStudent>(
    `SELECT id, name, telegram_user_id::text AS "telegramUserId"
     FROM students
     WHERE tutor_id = $1 AND archived_at IS NULL AND telegram_user_id IS NOT NULL`,
    [tutorId],
  );
  return result.rows;
}

async function insertOutbox(
  client: PoolClient,
  input: {
    kind: 'vacation' | 'vacation_cancelled';
    telegramUserId: string;
    role: 'tutor' | 'student';
    vacationId: string;
    payload: VacationNoticePayload | VacationCancelledPayload;
    availableAt: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO telegram_notification_outbox
       (kind, telegram_user_id, role, entity_id, payload, available_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      input.kind,
      input.telegramUserId,
      input.role,
      input.vacationId,
      JSON.stringify(input.payload),
      input.availableAt.toISOString(),
    ],
  );
}

async function deleteVacationKindOutbox(
  client: PoolClient,
  vacationId: string,
  kinds: Array<'vacation' | 'vacation_cancelled'>,
): Promise<void> {
  await client.query(
    `DELETE FROM telegram_notification_outbox
     WHERE entity_id = $1 AND kind = ANY($2::text[])`,
    [vacationId, kinds],
  );
}

async function pendingVacationOutbox(
  client: PoolClient,
  vacationId: string,
): Promise<Array<{ id: string; telegram_user_id: string; role: 'tutor' | 'student' }>> {
  const result = await client.query<{
    id: string;
    telegram_user_id: string;
    role: 'tutor' | 'student';
  }>(
    `SELECT id, telegram_user_id::text AS telegram_user_id, role
     FROM telegram_notification_outbox
     WHERE entity_id = $1 AND kind = 'vacation'`,
    [vacationId],
  );
  return result.rows;
}

async function enqueueStudentVacationNotices(
  client: PoolClient,
  tutorId: string,
  ctx: TutorNotifyCtx,
  vacation: VacationRow,
  availableAt: Date,
  rewriteIds?: Map<string, string>,
): Promise<void> {
  if (!vacation.student_id) return;
  const studentName = await loadStudentName(client, tutorId, vacation.student_id);
  const removedStarts = await removedStartsFor(
    client,
    tutorId,
    ctx.timezone,
    vacation,
    vacation.student_id,
  );
  const nextStartUtc = await nextLessonStartUtc(
    client,
    tutorId,
    ctx.timezone,
    vacation.end_date,
    vacation.student_id,
  );
  const student = await client.query<{
    telegram_user_id: string | null;
    archived: boolean;
  }>(
    `SELECT telegram_user_id::text AS telegram_user_id, (archived_at IS NOT NULL) AS archived
     FROM students WHERE id = $1 AND tutor_id = $2`,
    [vacation.student_id, tutorId],
  );
  const row = student.rows[0];

  const recipients: Array<{ telegramUserId: string; role: 'tutor' | 'student'; silent: boolean }> =
    [];
  if (ctx.telegramUserId && ctx.notifyEnabled && ctx.notifyLessons) {
    recipients.push({ telegramUserId: ctx.telegramUserId, role: 'tutor', silent: ctx.silent });
  }
  if (row?.telegram_user_id && !row.archived) {
    recipients.push({ telegramUserId: row.telegram_user_id, role: 'student', silent: false });
  }

  for (const recipient of recipients) {
    const payload: VacationNoticePayload = {
      scope: 'student',
      studentName,
      startDate: vacation.start_date,
      endDate: vacation.end_date,
      removedStarts,
      nextStartUtc,
      timezone: ctx.timezone,
      silent: recipient.silent,
    };
    const existing = rewriteIds?.get(`${recipient.telegramUserId}:${recipient.role}`);
    if (existing) {
      await client.query(`UPDATE telegram_notification_outbox SET payload = $2::jsonb WHERE id = $1`, [
        existing,
        JSON.stringify(payload),
      ]);
      continue;
    }
    await insertOutbox(client, {
      kind: 'vacation',
      telegramUserId: recipient.telegramUserId,
      role: recipient.role,
      vacationId: vacation.id,
      payload,
      availableAt,
    });
  }
}

async function enqueueTutorVacationNotices(
  client: PoolClient,
  tutorId: string,
  ctx: TutorNotifyCtx,
  vacation: VacationRow,
  availableAt: Date,
  rewriteIds?: Map<string, string>,
): Promise<void> {
  const students = await loadLinkedStudents(client, tutorId);
  for (const student of students) {
    const removedStarts = await removedStartsFor(
      client,
      tutorId,
      ctx.timezone,
      vacation,
      student.id,
    );
    const nextStartUtc = await nextLessonStartUtc(
      client,
      tutorId,
      ctx.timezone,
      vacation.end_date,
      student.id,
    );
    const payload: VacationNoticePayload = {
      scope: 'tutor',
      studentName: student.name,
      startDate: vacation.start_date,
      endDate: vacation.end_date,
      removedStarts,
      nextStartUtc,
      timezone: ctx.timezone,
      silent: false,
    };
    const existing = rewriteIds?.get(`${student.telegramUserId}:student`);
    if (existing) {
      await client.query(`UPDATE telegram_notification_outbox SET payload = $2::jsonb WHERE id = $1`, [
        existing,
        JSON.stringify(payload),
      ]);
      continue;
    }
    await insertOutbox(client, {
      kind: 'vacation',
      telegramUserId: student.telegramUserId,
      role: 'student',
      vacationId: vacation.id,
      payload,
      availableAt,
    });
  }
}

async function syncVacationNotices(
  client: PoolClient,
  tutorId: string,
  ctx: TutorNotifyCtx,
  vacation: VacationRow,
  now: Date,
): Promise<void> {
  const pending = await pendingVacationOutbox(client, vacation.id);
  const rewriteIds =
    pending.length > 0
      ? new Map(pending.map((row) => [`${row.telegram_user_id}:${row.role}`, row.id]))
      : undefined;
  const availableAt = new Date(now.getTime() + VACATION_NOTIFY_DELAY_MS);
  if (vacation.student_id) {
    await enqueueStudentVacationNotices(client, tutorId, ctx, vacation, availableAt, rewriteIds);
  } else {
    await enqueueTutorVacationNotices(client, tutorId, ctx, vacation, availableAt, rewriteIds);
  }
}

async function enqueueCancelledNotices(
  client: PoolClient,
  tutorId: string,
  ctx: TutorNotifyCtx,
  vacation: VacationRow,
  restoredFromDate: string,
  now: Date,
): Promise<void> {
  const availableAt = new Date(now.getTime() + VACATION_NOTIFY_DELAY_MS);
  if (vacation.student_id) {
    const studentName = await loadStudentName(client, tutorId, vacation.student_id);
    const student = await client.query<{
      telegram_user_id: string | null;
      archived: boolean;
    }>(
      `SELECT telegram_user_id::text AS telegram_user_id, (archived_at IS NOT NULL) AS archived
       FROM students WHERE id = $1 AND tutor_id = $2`,
      [vacation.student_id, tutorId],
    );
    const row = student.rows[0];
    const recipients: Array<{ telegramUserId: string; role: 'tutor' | 'student'; silent: boolean }> =
      [];
    if (ctx.telegramUserId && ctx.notifyEnabled && ctx.notifyLessons) {
      recipients.push({ telegramUserId: ctx.telegramUserId, role: 'tutor', silent: ctx.silent });
    }
    if (row?.telegram_user_id && !row.archived) {
      recipients.push({ telegramUserId: row.telegram_user_id, role: 'student', silent: false });
    }
    for (const recipient of recipients) {
      const payload: VacationCancelledPayload = {
        scope: 'student',
        studentName,
        restoredFromDate,
        timezone: ctx.timezone,
        silent: recipient.silent,
      };
      await insertOutbox(client, {
        kind: 'vacation_cancelled',
        telegramUserId: recipient.telegramUserId,
        role: recipient.role,
        vacationId: vacation.id,
        payload,
        availableAt,
      });
    }
    return;
  }

  const students = await loadLinkedStudents(client, tutorId);
  for (const student of students) {
    const payload: VacationCancelledPayload = {
      scope: 'tutor',
      studentName: student.name,
      restoredFromDate,
      timezone: ctx.timezone,
      silent: false,
    };
    await insertOutbox(client, {
      kind: 'vacation_cancelled',
      telegramUserId: student.telegramUserId,
      role: 'student',
      vacationId: vacation.id,
      payload,
      availableAt,
    });
  }
}

async function runInTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listOpenVacations(tutorId: string, now = new Date()): Promise<Vacation[]> {
  return runInTx(async (client) => {
    const ctx = await loadTutorNotify(client, tutorId);
    const today = dateKeyInTz(now, ctx.timezone);
    const rows = await loadOpenVacations(client, tutorId, today);
    const dtos: Vacation[] = [];
    for (const row of rows) {
      dtos.push(await toVacationDto(client, tutorId, ctx.timezone, row));
    }
    return dtos;
  });
}

export async function createVacation(
  tutorId: string,
  input: CreateVacationInput,
  now = new Date(),
): Promise<VacationWriteResult> {
  const studentId = input.studentId ?? null;
  const personalGroupIds = studentId ? [] : (input.personalGroupIds ?? []);
  if (studentId && (input.personalGroupIds?.length ?? 0) > 0) {
    throw new AppError('VALIDATION', 400, 'personalGroupIds is only allowed on tutor vacations');
  }
  if (input.endDate < input.startDate) {
    throw new AppError('VALIDATION', 400, 'endDate must be on or after startDate', {
      endDate: 'invalid',
    });
  }
  if (studentId) {
    await assertActiveStudentOwned(tutorId, studentId);
  }

  return runInTx(async (client) => {
    const ctx = await loadTutorNotify(client, tutorId);
    const today = dateKeyInTz(now, ctx.timezone);
    await assertPersonalGroupsOwned(client, tutorId, personalGroupIds);
    await assertNoOpenVacation(client, tutorId, studentId, today);
    const notifyAt = new Date(now.getTime() + VACATION_NOTIFY_DELAY_MS);
    const inserted = await client.query<VacationRow>(
      `INSERT INTO vacations (
         tutor_id, student_id, start_date, end_date, personal_group_ids, notify_at
       ) VALUES ($1, $2, $3, $4, $5::uuid[], $6)
       RETURNING ${VACATION_COLUMNS}`,
      [tutorId, studentId, input.startDate, input.endDate, personalGroupIds, notifyAt.toISOString()],
    );
    const row = inserted.rows[0]!;
    const diff = await recomputeHidden(client, tutorId, ctx.timezone, row.id, now);
    const fresh = await loadVacationRow(client, tutorId, row.id);
    await syncVacationNotices(client, tutorId, ctx, fresh, now);
    return {
      vacation: await toVacationDto(client, tutorId, ctx.timezone, fresh),
      ...diff,
    };
  });
}

export async function patchVacation(
  tutorId: string,
  vacationId: string,
  input: PatchVacationInput,
  now = new Date(),
): Promise<VacationWriteResult> {
  return runInTx(async (client) => {
    const ctx = await loadTutorNotify(client, tutorId);
    const today = dateKeyInTz(now, ctx.timezone);
    const existing = await loadVacationRow(client, tutorId, vacationId, true);
    if (!isOpenVacation(existing, today)) {
      throw new AppError('CONFLICT', 409, 'Vacation is not open');
    }
    const startDate = input.startDate ?? existing.start_date;
    const endDate = input.endDate ?? existing.end_date;
    if (endDate < startDate) {
      throw new AppError('VALIDATION', 400, 'endDate must be on or after startDate', {
        endDate: 'invalid',
      });
    }
    let personalGroupIds = existing.personal_group_ids ?? [];
    if (input.personalGroupIds !== undefined) {
      if (existing.student_id) {
        throw new AppError('VALIDATION', 400, 'personalGroupIds is only allowed on tutor vacations');
      }
      personalGroupIds = input.personalGroupIds;
      await assertPersonalGroupsOwned(client, tutorId, personalGroupIds);
    }
    await assertNoOpenVacation(client, tutorId, existing.student_id, today, existing.id);

    const updated = await client.query<VacationRow>(
      `UPDATE vacations
       SET start_date = $1, end_date = $2, personal_group_ids = $3::uuid[], updated_at = now()
       WHERE id = $4 AND tutor_id = $5
       RETURNING ${VACATION_COLUMNS}`,
      [startDate, endDate, personalGroupIds, vacationId, tutorId],
    );
    const row = updated.rows[0]!;
    const diff = await recomputeHidden(client, tutorId, ctx.timezone, row.id, now);
    const fresh = await loadVacationRow(client, tutorId, row.id);
    await syncVacationNotices(client, tutorId, ctx, fresh, now);
    return {
      vacation: await toVacationDto(client, tutorId, ctx.timezone, fresh),
      ...diff,
    };
  });
}

export async function returnFromVacation(
  tutorId: string,
  vacationId: string,
  now = new Date(),
): Promise<VacationWriteResult> {
  return runInTx(async (client) => {
    const ctx = await loadTutorNotify(client, tutorId);
    const today = dateKeyInTz(now, ctx.timezone);
    const existing = await loadVacationRow(client, tutorId, vacationId, true);
    if (!isOpenVacation(existing, today)) {
      throw new AppError('CONFLICT', 409, 'Vacation is not open');
    }

    const fullyCancel = existing.start_date >= today;
    const restoredFromDate = fullyCancel ? existing.start_date : today;
    const yesterday = addDaysToDateOnly(today, -1);
    const nextEnd = fullyCancel ? existing.start_date : yesterday;
    const cancel = fullyCancel || nextEnd < existing.start_date;

    const updated = await client.query<VacationRow>(
      `UPDATE vacations
       SET end_date = $1,
           cancelled_at = CASE WHEN $2 THEN now() ELSE cancelled_at END,
           updated_at = now()
       WHERE id = $3 AND tutor_id = $4
       RETURNING ${VACATION_COLUMNS}`,
      [nextEnd, cancel, vacationId, tutorId],
    );
    const row = updated.rows[0]!;
    const diff = await recomputeHidden(client, tutorId, ctx.timezone, row.id, now);

    const wasNotified = existing.notified_at != null;
    await deleteVacationKindOutbox(client, row.id, ['vacation']);
    if (wasNotified) {
      await enqueueCancelledNotices(client, tutorId, ctx, row, restoredFromDate, now);
    }

    const fresh = await loadVacationRow(client, tutorId, row.id);
    return {
      vacation: await toVacationDto(client, tutorId, ctx.timezone, fresh),
      ...diff,
    };
  });
}

export async function loadOpenStudentVacationEmbeds(
  tutorId: string,
  now = new Date(),
): Promise<Map<string, StudentVacation>> {
  const prefs = await getTutorSchedulePrefs(tutorId);
  const today = dateKeyInTz(now, prefs.timezone);
  const result = await getPool().query<{
    id: string;
    student_id: string;
    start_date: string;
    end_date: string;
  }>(
    `SELECT id, student_id, start_date::text AS start_date, end_date::text AS end_date
     FROM vacations
     WHERE tutor_id = $1
       AND student_id IS NOT NULL
       AND cancelled_at IS NULL
       AND end_date >= $2::date`,
    [tutorId, today],
  );
  const map = new Map<string, StudentVacation>();
  for (const row of result.rows) {
    map.set(row.student_id, {
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
    });
  }
  return map;
}
