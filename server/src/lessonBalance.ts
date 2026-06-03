import type { PoolClient } from 'pg';
import { recordBalanceMovement } from './balanceMovements.js';
import { getPool, query } from './db.js';
import type { AcademicUnits, BalanceKind, LessonStatus } from './types.js';
import type { LessonRow, StudentRow } from './mappers.js';

export function lessonEndUtc(startUtc: Date, durationMin: number): Date {
  return new Date(startUtc.getTime() + durationMin * 60_000);
}

export function isLessonEnded(
  startUtc: Date,
  durationMin: number,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= lessonEndUtc(startUtc, durationMin).getTime();
}

export function computeChargeAmount(
  balanceKind: BalanceKind,
  academicUnits: AcademicUnits,
  rate: number | null,
): number | null {
  if (balanceKind === 'lessons') return academicUnits;
  if (rate == null) return null;
  return rate * academicUnits;
}

type LessonBalanceRow = Pick<
  LessonRow,
  | 'id'
  | 'student_id'
  | 'start_utc'
  | 'duration_min'
  | 'academic_units'
  | 'status'
  | 'paid'
  | 'balance_charged'
  | 'balance_paid_applied'
  | 'charge_prepaid_delta'
  | 'charge_debt_delta'
>;

async function reloadLessonBalanceRow(
  client: PoolClient,
  lessonId: string,
): Promise<LessonBalanceRow> {
  const result = await client.query<LessonBalanceRow>(
    `SELECT id, student_id, start_utc, duration_min, academic_units, status, paid,
            balance_charged, balance_paid_applied,
            charge_prepaid_delta, charge_debt_delta
     FROM lessons WHERE id = $1`,
    [lessonId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Lesson not found');
  return row;
}

type StudentBalanceRow = Pick<
  StudentRow,
  'id' | 'balance_kind' | 'prepaid' | 'debt' | 'rate' | 'is_group'
>;

async function loadStudent(client: PoolClient, studentId: string): Promise<StudentBalanceRow> {
  const result = await client.query<StudentBalanceRow>(
    `SELECT id, balance_kind, prepaid, debt, rate, is_group
     FROM students WHERE id = $1 FOR UPDATE`,
    [studentId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Student not found');
  return row;
}

async function setLessonPaidFlag(
  client: PoolClient,
  lessonId: string,
  paid: boolean,
): Promise<void> {
  await client.query(
    `UPDATE lessons SET paid = $1, updated_at = now() WHERE id = $2`,
    [paid, lessonId],
  );
}

export function lessonOpenDebtAmount(lesson: LessonBalanceRow): number {
  if (!lesson.balance_charged || lesson.balance_paid_applied) return 0;
  return Number(lesson.charge_debt_delta);
}

export async function applyLessonBalanceCharge(
  client: PoolClient,
  lesson: LessonBalanceRow,
  student: StudentBalanceRow,
): Promise<void> {
  if (lesson.balance_charged || student.is_group) return;

  const chargeAmount = computeChargeAmount(
    student.balance_kind,
    lesson.academic_units,
    student.rate !== null ? Number(student.rate) : null,
  );
  if (chargeAmount == null || chargeAmount <= 0) return;

  const prepaid = Number(student.prepaid);
  const fromPrepaid = Math.min(prepaid, chargeAmount);
  const toDebt = chargeAmount - fromPrepaid;

  await client.query(
    `UPDATE students SET prepaid = prepaid - $1, debt = debt + $2 WHERE id = $3`,
    [fromPrepaid, toDebt, student.id],
  );
  await client.query(
    `UPDATE lessons
     SET balance_charged = true,
         charge_prepaid_delta = $1,
         charge_debt_delta = $2,
         updated_at = now()
     WHERE id = $3`,
    [fromPrepaid, toDebt, lesson.id],
  );

  await recordBalanceMovement(client, {
    studentId: student.id,
    lessonId: lesson.id,
    occurredAt: lesson.start_utc,
    kind: 'lesson_charge',
    prepaidDelta: -fromPrepaid,
    debtDelta: toDebt,
  });
}

/** Settles only the debt portion of a lesson charge (real money received). */
export async function applyLessonBalancePayment(
  client: PoolClient,
  lesson: LessonBalanceRow,
): Promise<void> {
  if (!lesson.balance_charged || lesson.balance_paid_applied) return;

  const toDebt = Number(lesson.charge_debt_delta);
  if (toDebt <= 0) return;

  await client.query(
    `UPDATE students SET debt = GREATEST(0, debt - $1) WHERE id = $2`,
    [toDebt, lesson.student_id],
  );
  await client.query(
    `UPDATE lessons
     SET balance_paid_applied = true,
         updated_at = now()
     WHERE id = $1`,
    [lesson.id],
  );

  await recordBalanceMovement(client, {
    studentId: lesson.student_id,
    lessonId: lesson.id,
    kind: 'lesson_paid',
    prepaidDelta: 0,
    debtDelta: -toDebt,
  });
}

export async function reverseLessonBalancePayment(
  client: PoolClient,
  lesson: LessonBalanceRow,
): Promise<void> {
  if (!lesson.balance_paid_applied) return;

  const toDebt = Number(lesson.charge_debt_delta);

  await client.query(
    `UPDATE students SET debt = debt + $1 WHERE id = $2`,
    [toDebt, lesson.student_id],
  );
  await client.query(
    `UPDATE lessons
     SET balance_paid_applied = false,
         updated_at = now()
     WHERE id = $1`,
    [lesson.id],
  );
}

export async function reverseLessonBalanceCharge(
  client: PoolClient,
  lesson: LessonBalanceRow,
): Promise<void> {
  if (!lesson.balance_charged) return;

  await reverseLessonBalancePayment(client, lesson);

  const fromPrepaid = Number(lesson.charge_prepaid_delta);
  const toDebt = Number(lesson.charge_debt_delta);

  await client.query(
    `UPDATE students SET prepaid = prepaid + $1, debt = GREATEST(0, debt - $2) WHERE id = $3`,
    [fromPrepaid, toDebt, lesson.student_id],
  );
  await client.query(
    `UPDATE lessons
     SET balance_charged = false,
         charge_prepaid_delta = 0,
         charge_debt_delta = 0,
         updated_at = now()
     WHERE id = $1`,
    [lesson.id],
  );

  await recordBalanceMovement(client, {
    studentId: lesson.student_id,
    lessonId: lesson.id,
    kind: 'lesson_reverse',
    prepaidDelta: fromPrepaid,
    debtDelta: -toDebt,
  });
}

async function syncPaidAfterCompletedCharge(
  client: PoolClient,
  lessonId: string,
  requestPaid: boolean,
): Promise<void> {
  const lesson = await reloadLessonBalanceRow(client, lessonId);
  const openDebt = lessonOpenDebtAmount(lesson);

  if (openDebt === 0 && lesson.balance_charged) {
    await setLessonPaidFlag(client, lessonId, true);
    return;
  }

  if (requestPaid) {
    await applyLessonBalancePayment(client, lesson);
    await setLessonPaidFlag(client, lessonId, true);
    return;
  }

  await setLessonPaidFlag(client, lessonId, false);
}

export async function syncLessonBalanceForStatus(
  client: PoolClient,
  lesson: LessonBalanceRow,
  previousStatus: LessonStatus,
  nextStatus: LessonStatus,
  requestPaid: boolean,
): Promise<void> {
  if (nextStatus === 'completed') {
    const student = await loadStudent(client, lesson.student_id);
    await applyLessonBalanceCharge(client, lesson, student);
    await syncPaidAfterCompletedCharge(client, lesson.id, requestPaid);
    return;
  }

  if (previousStatus === 'completed' && lesson.balance_charged) {
    await reverseLessonBalanceCharge(client, lesson);
    await setLessonPaidFlag(client, lesson.id, false);
  }
}

export async function syncLessonBalanceForPaid(
  client: PoolClient,
  lesson: LessonBalanceRow,
  nextPaid: boolean,
): Promise<void> {
  const status = lesson.status;

  if (status === 'completed') {
    if (nextPaid) {
      const fresh = await reloadLessonBalanceRow(client, lesson.id);
      await applyLessonBalancePayment(client, fresh);
      await setLessonPaidFlag(client, lesson.id, true);
    } else {
      await reverseLessonBalancePayment(client, lesson);
      await setLessonPaidFlag(client, lesson.id, false);
    }
    return;
  }

  if (status === 'cancelled' || status === 'no_show') {
    if (nextPaid) {
      const student = await loadStudent(client, lesson.student_id);
      await applyLessonBalanceCharge(client, lesson, student);
      const charged = await reloadLessonBalanceRow(client, lesson.id);
      if (lessonOpenDebtAmount(charged) > 0) {
        await setLessonPaidFlag(client, lesson.id, true);
      } else if (charged.balance_charged) {
        await setLessonPaidFlag(client, lesson.id, true);
      } else {
        await setLessonPaidFlag(client, lesson.id, true);
      }
    } else {
      if (lesson.balance_charged) {
        await reverseLessonBalanceCharge(client, lesson);
      }
      await setLessonPaidFlag(client, lesson.id, false);
    }
  }
}

const LESSON_BALANCE_SELECT = `id, student_id, start_utc, duration_min, academic_units, status, paid,
            balance_charged, balance_paid_applied,
            charge_prepaid_delta, charge_debt_delta`;

/** After balance top-up, mark oldest completed lessons with open debt as paid. */
export async function settleLessonsFromBalanceTopUp(
  client: PoolClient,
  studentId: string,
  prepaidBefore: number,
  debtBefore: number,
  prepaidAfter: number,
  debtAfter: number,
): Promise<void> {
  const netBefore = prepaidBefore - debtBefore;
  const netAfter = prepaidAfter - debtAfter;
  let credit = netAfter - netBefore;
  if (credit <= 0) return;

  const result = await client.query<LessonBalanceRow>(
    `SELECT ${LESSON_BALANCE_SELECT}
     FROM lessons
     WHERE student_id = $1
       AND status = 'completed'
       AND balance_charged = true
       AND balance_paid_applied = false
       AND charge_debt_delta > 0
       AND paid = false
     ORDER BY start_utc ASC`,
    [studentId],
  );

  for (const row of result.rows) {
    const need = Number(row.charge_debt_delta);
    if (credit < need) break;

    await applyLessonBalancePayment(client, row);
    await setLessonPaidFlag(client, row.id, true);
    credit -= need;
  }
}

export async function runAutoCompleteForTutor(
  tutorId: string,
  opts?: { from?: Date; to?: Date },
): Promise<void> {
  const params: unknown[] = [tutorId];
  let rangeFilter = '';
  if (opts?.from && opts?.to) {
    rangeFilter = ` AND start_utc >= $2 AND start_utc < $3`;
    params.push(opts.from.toISOString(), opts.to.toISOString());
  }

  const due = await query<LessonBalanceRow>(
    `SELECT ${LESSON_BALANCE_SELECT}
     FROM lessons
     WHERE tutor_id = $1
       AND status = 'planned'
       AND start_utc + (duration_min * interval '1 minute') <= now()${rangeFilter}`,
    params,
  );

  if (due.rows.length === 0) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const lesson of due.rows) {
      const locked = await client.query<LessonBalanceRow>(
        `SELECT ${LESSON_BALANCE_SELECT}
         FROM lessons WHERE id = $1 FOR UPDATE`,
        [lesson.id],
      );
      const row = locked.rows[0];
      if (!row || row.status !== 'planned') continue;
      if (!isLessonEnded(row.start_utc, row.duration_min)) continue;

      await client.query(
        `UPDATE lessons SET status = 'completed', updated_at = now() WHERE id = $1`,
        [row.id],
      );
      const updated = { ...row, status: 'completed' as LessonStatus };
      const student = await loadStudent(client, row.student_id);
      await applyLessonBalanceCharge(client, updated, student);
      await syncPaidAfterCompletedCharge(client, row.id, false);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
