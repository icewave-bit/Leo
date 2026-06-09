import type { PoolClient } from 'pg';
import { AppError } from './errors.js';
import type { BalanceKind } from './types.js';

interface StudentBillingRow {
  id: string;
  tutor_id: string;
  billing_student_id: string | null;
  balance_kind: BalanceKind;
  currency: string;
  is_group: boolean;
  archived_at: Date | null;
}

async function loadStudentBilling(
  client: PoolClient,
  studentId: string,
): Promise<StudentBillingRow | null> {
  const result = await client.query<StudentBillingRow>(
    `SELECT id, tutor_id, billing_student_id, balance_kind, currency, is_group, archived_at
     FROM students WHERE id = $1`,
    [studentId],
  );
  return result.rows[0] ?? null;
}

/** Root payer whose prepaid/debt is charged for this student. */
export async function resolveBillingStudentId(
  client: PoolClient,
  studentId: string,
  visited = new Set<string>(),
): Promise<string> {
  if (visited.has(studentId)) {
    throw new AppError('VALIDATION', 400, 'Billing cycle detected');
  }
  visited.add(studentId);

  const row = await loadStudentBilling(client, studentId);
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Student not found');
  }
  if (!row.billing_student_id) return studentId;
  return resolveBillingStudentId(client, row.billing_student_id, visited);
}

export async function countBillingDependents(
  client: PoolClient,
  payerStudentId: string,
  activeOnly = true,
): Promise<number> {
  const archivedFilter = activeOnly ? ' AND archived_at IS NULL' : '';
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM students
     WHERE billing_student_id = $1${archivedFilter}`,
    [payerStudentId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function listBillingDependentIds(
  client: PoolClient,
  payerStudentId: string,
): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM students WHERE billing_student_id = $1 AND archived_at IS NULL`,
    [payerStudentId],
  );
  return result.rows.map((r) => r.id);
}

export function assertBalanceEditable(row: {
  billing_student_id: string | null;
}): void {
  if (row.billing_student_id) {
    throw new AppError(
      'CONFLICT',
      409,
      'Balance is managed by the billing payer; edit the payer account instead',
    );
  }
}

export async function validateBillingPayer(
  client: PoolClient,
  tutorId: string,
  billingStudentId: string,
): Promise<StudentBillingRow> {
  const payer = await loadStudentBilling(client, billingStudentId);
  if (!payer || payer.tutor_id !== tutorId) {
    throw new AppError('NOT_FOUND', 404, 'Billing payer not found');
  }
  if (payer.is_group) {
    throw new AppError('VALIDATION', 400, 'Groups cannot be billing payers');
  }
  if (payer.archived_at) {
    throw new AppError('CONFLICT', 409, 'Cannot bill through an archived student');
  }
  if (payer.billing_student_id) {
    throw new AppError(
      'VALIDATION',
      400,
      'Billing payer must manage their own balance (not bill through someone else)',
    );
  }
  return payer;
}

export async function validateBillingStudentAssignment(
  client: PoolClient,
  tutorId: string,
  studentId: string,
  billingStudentId: string | null,
): Promise<void> {
  if (billingStudentId === null) return;

  if (billingStudentId === studentId) {
    throw new AppError('VALIDATION', 400, 'Student cannot bill through themselves');
  }

  const student = await loadStudentBilling(client, studentId);
  const payer = await validateBillingPayer(client, tutorId, billingStudentId);

  if (!student || student.tutor_id !== tutorId) {
    throw new AppError('NOT_FOUND', 404, 'Student not found');
  }
  if (student.is_group) {
    throw new AppError('VALIDATION', 400, 'Groups cannot use a shared billing account');
  }

  const dependents = await countBillingDependents(client, studentId);
  if (dependents > 0) {
    throw new AppError(
      'CONFLICT',
      409,
      'Cannot link billing while other students bill through this account',
    );
  }

  if (student.currency !== payer.currency) {
    throw new AppError(
      'VALIDATION',
      400,
      'Billing payer must use the same currency',
    );
  }
}
