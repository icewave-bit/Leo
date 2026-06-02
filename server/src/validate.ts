import type { z } from 'zod';
import { AppError } from './errors.js';

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_root';
      details[path] = issue.message;
    }
    throw new AppError('VALIDATION', 400, 'Validation failed', details);
  }
  return result.data;
}
