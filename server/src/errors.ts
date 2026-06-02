import type { ErrorCode } from './types.js';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
