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

type PgErrorLike = {
  code: string;
  message: string;
  constraint?: string;
  table?: string;
  detail?: string;
};

const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  students_prepaid_check: 'Предоплата не может быть отрицательной',
  students_debt_check: 'Долг не может быть отрицательным',
};

export function asPgError(err: unknown): PgErrorLike | null {
  if (!err || typeof err !== 'object') return null;
  const rec = err as Record<string, unknown>;
  if (typeof rec.code !== 'string' || typeof rec.severity !== 'string') return null;
  return {
    code: rec.code,
    message: err instanceof Error ? err.message : String(rec.message ?? ''),
    constraint: typeof rec.constraint === 'string' ? rec.constraint : undefined,
    table: typeof rec.table === 'string' ? rec.table : undefined,
    detail: typeof rec.detail === 'string' ? rec.detail : undefined,
  };
}

/** Map known DB constraint failures to AppError; leave the rest as-is. */
export function normalizeError(err: unknown): unknown {
  if (err instanceof AppError) return err;
  const pg = asPgError(err);
  if (pg?.code === '23514') {
    const message =
      (pg.constraint && CHECK_CONSTRAINT_MESSAGES[pg.constraint]) || pg.message;
    return new AppError('CONFLICT', 409, message, {
      constraint: pg.constraint,
      table: pg.table,
      detail: pg.detail,
      pgMessage: pg.message,
    });
  }
  return err;
}

export function activityErrorFields(err: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  const normalized = normalizeError(err);
  if (normalized instanceof AppError) {
    const constraint = normalized.details?.constraint;
    return {
      code: typeof constraint === 'string' && constraint ? constraint : normalized.code,
      message: normalized.message,
      details: normalized.details,
    };
  }
  if (normalized instanceof Error) {
    const pg = asPgError(normalized);
    return {
      code: pg?.constraint || pg?.code || 'INTERNAL',
      message: normalized.message,
      details: pg
        ? { constraint: pg.constraint, table: pg.table, pgCode: pg.code, detail: pg.detail }
        : undefined,
    };
  }
  return { code: 'INTERNAL', message: String(err) };
}

export function toPublicError(
  err: unknown,
  isProd: boolean,
): {
  status: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  const normalized = normalizeError(err);
  if (normalized instanceof AppError) {
    const details = publicErrorDetails(normalized.details);
    return {
      status: normalized.status,
      code: normalized.code,
      message: normalized.message,
      details,
    };
  }
  const message =
    normalized instanceof Error ? normalized.message : String(normalized);
  return {
    status: 500,
    code: 'INTERNAL',
    message: isProd ? 'Internal server error' : message,
  };
}

function publicErrorDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const out: Record<string, unknown> = {};
  if (typeof details.constraint === 'string') out.constraint = details.constraint;
  if (typeof details.table === 'string') out.table = details.table;
  return Object.keys(out).length > 0 ? out : undefined;
}
