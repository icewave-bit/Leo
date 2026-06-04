import { query } from './db.js';
import { AppError } from './errors.js';

export async function assertStudentOwned(
  tutorId: string,
  studentId: string,
): Promise<void> {
  const result = await query<{ id: string }>(
    'SELECT id FROM students WHERE id = $1 AND tutor_id = $2',
    [studentId, tutorId],
  );
  if (result.rows.length === 0) {
    throw new AppError('VALIDATION', 400, 'Student not found', { studentId: 'invalid' });
  }
}

export async function assertActiveStudentOwned(
  tutorId: string,
  studentId: string,
): Promise<void> {
  const result = await query<{ id: string }>(
    'SELECT id FROM students WHERE id = $1 AND tutor_id = $2 AND archived_at IS NULL',
    [studentId, tutorId],
  );
  if (result.rows.length === 0) {
    throw new AppError('VALIDATION', 400, 'Student not found', { studentId: 'invalid' });
  }
}
