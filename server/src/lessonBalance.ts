import type { PoolClient } from 'pg';
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
  | 'balance_charged'
  | 'charge_prepaid_delta'
  | 'charge_debt_delta'
>;

type StudentBalanceRow = Pick<
  StudentRow,
  'id' | 'balance_kind' | 'prepaid' | 'debt' | 'rate'
>;

async function loadStudent(client: PoolClient, studentId: string): Promise<StudentBalanceRow> {
  const result = await client.query<StudentBalanceRow>(
    `SELECT id, balance_kind, prepaid, debt, rate
     FROM students WHERE id = $1 FOR UPDATE`,
    [studentId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Student not found');
  return row;
}

export async function applyLessonBalanceCharge(
  client: PoolClient,
  lesson: LessonBalanceRow,
  student: StudentBalanceRow,
): Promise<void> {
  if (lesson.balance_charged) return;

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
}

export async function reverseLessonBalanceCharge(
  client: PoolClient,
  lesson: LessonBalanceRow,
): Promise<void> {
  if (!lesson.balance_charged) return;

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
}

export async function syncLessonBalanceForStatus(
  client: PoolClient,
  lesson: LessonBalanceRow,
  nextStatus: LessonStatus,
): Promise<void> {
  const student = await loadStudent(client, lesson.student_id);
  if (nextStatus === 'completed') {
    await applyLessonBalanceCharge(client, lesson, student);
    return;
  }
  if (lesson.balance_charged) {
    await reverseLessonBalanceCharge(client, lesson);
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

  const due = await query<LessonBalanceRow & { student_id: string }>(
    `SELECT id, student_id, start_utc, duration_min, academic_units, status,
            balance_charged, charge_prepaid_delta, charge_debt_delta
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
        `SELECT id, student_id, start_utc, duration_min, academic_units, status,
                balance_charged, charge_prepaid_delta, charge_debt_delta
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
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
