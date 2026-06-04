import type { PoolClient } from 'pg';
import { getPool } from './db.js';
import { AppError } from './errors.js';

export async function archiveStudent(
  tutorId: string,
  studentId: string,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const row = await client.query<{ archived_at: Date | null }>(
      'SELECT archived_at FROM students WHERE id = $1 AND tutor_id = $2 FOR UPDATE',
      [studentId, tutorId],
    );
    if (row.rows.length === 0) {
      throw new AppError('NOT_FOUND', 404, 'Student not found');
    }
    if (row.rows[0]!.archived_at) {
      throw new AppError('CONFLICT', 409, 'Student is already archived');
    }

    await client.query(
      `UPDATE students SET archived_at = now() WHERE id = $1 AND tutor_id = $2`,
      [studentId, tutorId],
    );

    await client.query(
      `UPDATE recurring_schedules SET active = false, updated_at = now()
       WHERE student_id = $1 AND tutor_id = $2`,
      [studentId, tutorId],
    );

    await client.query(
      `UPDATE lessons SET status = 'cancelled', updated_at = now()
       WHERE student_id = $1 AND tutor_id = $2 AND status = 'planned'`,
      [studentId, tutorId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function restoreStudent(tutorId: string, studentId: string): Promise<void> {
  const result = await getPool().query(
    `UPDATE students SET archived_at = NULL
     WHERE id = $1 AND tutor_id = $2 AND archived_at IS NOT NULL
     RETURNING id`,
    [studentId, tutorId],
  );
  if (result.rowCount === 0) {
    const exists = await getPool().query(
      'SELECT archived_at FROM students WHERE id = $1 AND tutor_id = $2',
      [studentId, tutorId],
    );
    if (exists.rows.length === 0) {
      throw new AppError('NOT_FOUND', 404, 'Student not found');
    }
    throw new AppError('CONFLICT', 409, 'Student is not archived');
  }
}

export async function purgeArchivedStudent(
  tutorId: string,
  studentId: string,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const row = await client.query<{ archived_at: Date | null }>(
      'SELECT archived_at FROM students WHERE id = $1 AND tutor_id = $2 FOR UPDATE',
      [studentId, tutorId],
    );
    if (row.rows.length === 0) {
      throw new AppError('NOT_FOUND', 404, 'Student not found');
    }
    if (!row.rows[0]!.archived_at) {
      throw new AppError(
        'CONFLICT',
        409,
        'Only archived students can be permanently deleted',
      );
    }

    await deleteStudentData(client, tutorId, studentId);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteStudentData(
  client: PoolClient,
  tutorId: string,
  studentId: string,
): Promise<void> {
  await client.query(
    'DELETE FROM lessons WHERE student_id = $1 AND tutor_id = $2',
    [studentId, tutorId],
  );

  await client.query(
    `DELETE FROM recurring_schedule_skips
     WHERE recurring_schedule_id IN (
       SELECT id FROM recurring_schedules WHERE student_id = $1 AND tutor_id = $2
     )`,
    [studentId, tutorId],
  );

  await client.query(
    'DELETE FROM recurring_schedules WHERE student_id = $1 AND tutor_id = $2',
    [studentId, tutorId],
  );

  await client.query('DELETE FROM students WHERE id = $1 AND tutor_id = $2', [
    studentId,
    tutorId,
  ]);
}
