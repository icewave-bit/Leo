import { describe, it, expect } from 'vitest';
import { activityErrorFields, toPublicError } from '../errors.js';

function pgError(message: string, extra: Record<string, unknown>) {
  return Object.assign(new Error(message), { severity: 'ERROR', ...extra });
}

describe('error mapping', () => {
  it('maps students_prepaid_check to a readable conflict', () => {
    const err = pgError(
      'new row for relation "students" violates check constraint "students_prepaid_check"',
      { code: '23514', constraint: 'students_prepaid_check', table: 'students' },
    );

    const pub = toPublicError(err, true);
    expect(pub).toMatchObject({
      status: 409,
      code: 'CONFLICT',
      message: 'Предоплата не может быть отрицательной',
    });

    const fields = activityErrorFields(err);
    expect(fields.code).toBe('students_prepaid_check');
    expect(fields.message).toBe('Предоплата не может быть отрицательной');
    expect(fields.details).toMatchObject({
      constraint: 'students_prepaid_check',
      pgMessage: err.message,
    });
  });

  it('keeps unknown database errors as internal 500 with the raw message', () => {
    const err = pgError('numeric field overflow', {
      code: '22003',
      table: 'students',
    });

    expect(toPublicError(err, false)).toMatchObject({
      status: 500,
      code: 'INTERNAL',
      message: 'numeric field overflow',
    });
    expect(toPublicError(err, true).message).toBe('Internal server error');

    const fields = activityErrorFields(err);
    expect(fields.code).toBe('22003');
    expect(fields.message).toBe('numeric field overflow');
  });
});
