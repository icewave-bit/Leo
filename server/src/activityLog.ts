import { getPool } from './db.js';
import { AppError } from './errors.js';
import type { Request, Response } from 'express';

export type ActivityStatus = 'ok' | 'error';
export type ActivityActor = 'user' | 'system' | 'bot';
export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'move'
  | 'archive'
  | 'restore'
  | 'login'
  | 'other';
export type ActivityEntityType =
  | 'student'
  | 'lesson'
  | 'personal_event'
  | 'settings'
  | 'balance'
  | 'tax'
  | 'schedule'
  | 'auth'
  | 'other';

export type ActivitySnapshot = {
  studentId?: string;
  studentName?: string;
  entityLabel?: string;
  fields?: Record<string, unknown>;
};

export type ActivityLogRow = {
  id: string;
  occurred_at: Date | string;
  status: ActivityStatus;
  actor: ActivityActor;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  student_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  http_method: string | null;
  http_path: string | null;
  http_status: number | null;
};

export type ActivityLogDto = {
  id: string;
  occurredAt: string;
  status: ActivityStatus;
  actor: ActivityActor;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string | null;
  entityLabel: string | null;
  studentId: string | null;
  summary: string;
  details: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  httpMethod: string | null;
  httpPath: string | null;
  httpStatus: number | null;
};

const SECRET_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'code',
  'authorization',
  'cookie',
]);

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const SKIP_PREFIXES = ['/health', '/api/activity-log'];
const SKIP_AUTH_OK = new Set([
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/register',
]);

const SETTINGS_LABELS: Record<string, string> = {
  academicHourMin: 'ак. час',
  weekStartsOn: 'начало недели',
  defaultReplenishBalanceKind: 'тип пополнения',
  taxRatePercent: 'ставка налога',
  taxDisplayCurrency: 'валюта налога',
  hiddenWeekdays: 'скрытые дни',
  defaultBlockStartMinutes: 'начало блока',
  defaultBlockEndMinutes: 'конец блока',
  personalEventOutline: 'обводка событий',
  telegramNotify: 'уведомления Telegram',
};

const LESSON_STATUS_LABEL: Record<string, string> = {
  planned: 'запланирован',
  completed: 'проведён',
  cancelled: 'отменён',
  no_show: 'не пришёл',
};

export type ActivityEffect = {
  type: string;
  summary: string;
  entityId?: string;
  startUtc?: string;
  studentName?: string;
};

export type CascadeTarget = {
  id: string;
  start_utc: Date | string;
  student_id?: string;
  title?: string | null;
};

function lessonStatusLabel(status: unknown): string {
  const key = String(status);
  return LESSON_STATUS_LABEL[key] ?? key;
}

export function toActivityLog(row: ActivityLogRow): ActivityLogDto {
  const occurred =
    typeof row.occurred_at === 'string'
      ? row.occurred_at
      : row.occurred_at.toISOString();
  return {
    id: row.id,
    occurredAt: occurred,
    status: row.status,
    actor: row.actor,
    action: row.action as ActivityAction,
    entityType: row.entity_type as ActivityEntityType,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    studentId: row.student_id,
    summary: row.summary,
    details: row.details ?? {},
    errorCode: row.error_code,
    errorMessage: row.error_message,
    httpMethod: row.http_method,
    httpPath: row.http_path,
    httpStatus: row.http_status,
  };
}

export function sanitizeJson(value: unknown, depth = 0): unknown {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 40);
    for (const [key, nested] of entries) {
      if (SECRET_KEYS.has(key.toLowerCase())) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = sanitizeJson(nested, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
}

function lastUuid(path: string): string | null {
  const matches = path.match(new RegExp(UUID_RE, 'gi'));
  return matches?.at(-1) ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function idFromJson(value: unknown): string | null {
  const id = asRecord(value).id;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

function labelFromBody(body: unknown): string | null {
  const rec = asRecord(body);
  for (const key of ['name', 'title']) {
    if (typeof rec[key] === 'string' && rec[key].trim()) return rec[key].trim();
  }
  return null;
}

function studentIdFromBody(body: unknown): string | null {
  const id = asRecord(body).studentId;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

async function loadStudentName(tutorId: string, studentId: string): Promise<string | null> {
  try {
    const result = await getPool().query<{ name: string }>(
      'SELECT name FROM students WHERE id = $1 AND tutor_id = $2',
      [studentId, tutorId],
    );
    return result.rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

export async function prefetchSnapshot(req: Request): Promise<ActivitySnapshot | undefined> {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'POST') {
    return undefined;
  }
  const tutorId = req.session?.tutorId ?? req.tutorId;
  if (!tutorId) return undefined;
  const path = (req.originalUrl ?? req.url).split('?')[0] ?? '';
  const id = lastUuid(path);
  if (!id) return undefined;

  try {
    if (path.startsWith('/api/lessons')) {
      const result = await getPool().query<{
        student_id: string;
        student_name: string;
        start_utc: Date;
        status: string;
        paid: boolean;
        notes: string | null;
        duration_min: number;
        academic_units: number;
        recurring_schedule_id: string | null;
      }>(
        `SELECT l.student_id, s.name AS student_name, l.start_utc, l.status, l.paid, l.notes, l.duration_min,
                l.academic_units, l.recurring_schedule_id
         FROM lessons l JOIN students s ON s.id = l.student_id
         WHERE l.id = $1 AND l.tutor_id = $2`,
        [id, tutorId],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        studentId: row.student_id,
        studentName: row.student_name,
        fields: {
          studentId: row.student_id,
          studentName: row.student_name,
          startUtc: row.start_utc.toISOString(),
          status: row.status,
          paid: row.paid,
          notes: row.notes,
          durationMin: row.duration_min,
          academicUnits: row.academic_units,
          recurringScheduleId: row.recurring_schedule_id,
        },
      };
    }
    if (path.startsWith('/api/students')) {
      const result = await getPool().query<{
        id: string;
        name: string;
        prepaid: string;
        debt: string;
        balance_kind: string;
        rate: string | null;
        currency: string;
        note: string | null;
      }>(
        `SELECT id, name, prepaid, debt, balance_kind, rate, currency, note
         FROM students WHERE id = $1 AND tutor_id = $2`,
        [id, tutorId],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        studentId: row.id,
        studentName: row.name,
        entityLabel: row.name,
        fields: {
          name: row.name,
          prepaid: Number(row.prepaid),
          debt: Number(row.debt),
          balanceKind: row.balance_kind,
          rate: row.rate !== null ? Number(row.rate) : null,
          currency: row.currency,
          note: row.note,
        },
      };
    }
    if (path.startsWith('/api/personal-events')) {
      const result = await getPool().query<{
        title: string;
        start_utc: Date;
        duration_min: number;
        notes: string | null;
      }>(
        `SELECT title, start_utc, duration_min, notes
         FROM personal_events WHERE id = $1 AND tutor_id = $2`,
        [id, tutorId],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        entityLabel: row.title,
        fields: {
          title: row.title,
          startUtc: row.start_utc.toISOString(),
          durationMin: row.duration_min,
          notes: row.notes,
        },
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function withStudent(text: string, name: string | null): string {
  return name ? `${text} · ${name}` : text;
}

function classify(
  method: string,
  path: string,
  body: unknown,
  studentName: string | null,
  entityLabel: string | null,
): { action: ActivityAction; entityType: ActivityEntityType; summary: string } {
  const p = path.split('?')[0] ?? path;
  const rec = asRecord(body);
  const name = studentName ?? entityLabel ?? labelFromBody(body);

  if (p.startsWith('/api/students')) {
    if (p.endsWith('/archive') && method === 'POST') {
      return { action: 'archive', entityType: 'student', summary: withStudent('Ученик в архив', name) };
    }
    if (p.endsWith('/restore') && method === 'POST') {
      return { action: 'restore', entityType: 'student', summary: withStudent('Ученик восстановлен', name) };
    }
    if (method === 'POST') {
      return { action: 'create', entityType: 'student', summary: withStudent('Создан ученик', name) };
    }
    if (method === 'DELETE') {
      return { action: 'delete', entityType: 'student', summary: withStudent('Удалён ученик', name) };
    }
    const balanceTouched =
      rec.prepaid !== undefined || rec.debt !== undefined || rec.balanceKind !== undefined;
    if (balanceTouched) {
      return { action: 'update', entityType: 'balance', summary: withStudent('Изменён баланс', name) };
    }
    return { action: 'update', entityType: 'student', summary: withStudent('Изменён ученик', name) };
  }

  if (p.startsWith('/api/lessons')) {
    if (method === 'POST') {
      return { action: 'create', entityType: 'lesson', summary: withStudent('Создан урок', name) };
    }
    if (method === 'DELETE') {
      return { action: 'delete', entityType: 'lesson', summary: withStudent('Удалён урок', name) };
    }
    if (rec.startUtc !== undefined) {
      return { action: 'move', entityType: 'lesson', summary: withStudent('Урок перенесён', name) };
    }
    if (rec.status !== undefined) {
      return {
        action: 'update',
        entityType: 'lesson',
        summary: withStudent(`Статус урока: ${lessonStatusLabel(rec.status)}`, name),
      };
    }
    return { action: 'update', entityType: 'lesson', summary: withStudent('Изменён урок', name) };
  }

  if (p.startsWith('/api/recurring-schedules')) {
    if (method === 'POST') {
      return { action: 'create', entityType: 'lesson', summary: withStudent('Повторяющееся расписание', name) };
    }
    if (method === 'DELETE') {
      return { action: 'delete', entityType: 'lesson', summary: withStudent('Удалено расписание', name) };
    }
    return { action: 'update', entityType: 'lesson', summary: withStudent('Изменено расписание', name) };
  }

  if (p.startsWith('/api/personal-event-groups')) {
    if (method === 'POST') {
      return { action: 'create', entityType: 'personal_event', summary: withStudent('Создана группа', name) };
    }
    if (method === 'DELETE') {
      return { action: 'delete', entityType: 'personal_event', summary: 'Удалена группа событий' };
    }
    return { action: 'update', entityType: 'personal_event', summary: withStudent('Изменена группа', name) };
  }

  if (p.startsWith('/api/personal-events')) {
    if (method === 'POST') {
      return { action: 'create', entityType: 'personal_event', summary: withStudent('Создано событие', name) };
    }
    if (method === 'DELETE') {
      return { action: 'delete', entityType: 'personal_event', summary: withStudent('Удалено событие', name) };
    }
    if (rec.startUtc !== undefined) {
      return { action: 'move', entityType: 'personal_event', summary: withStudent('Событие перенесено', name) };
    }
    return { action: 'update', entityType: 'personal_event', summary: withStudent('Изменено событие', name) };
  }

  if (p.startsWith('/api/recurring-personal-schedules')) {
    if (method === 'POST') {
      return { action: 'create', entityType: 'personal_event', summary: withStudent('Повторяющееся событие', name) };
    }
    if (method === 'DELETE') {
      return { action: 'delete', entityType: 'personal_event', summary: 'Удалено повторяющееся событие' };
    }
    return { action: 'update', entityType: 'personal_event', summary: 'Изменено повторяющееся событие' };
  }

  if (p.startsWith('/api/schedule-slot-overrides')) {
    return { action: 'update', entityType: 'schedule', summary: 'Изменена блокировка слота' };
  }

  if (p.startsWith('/api/taxes')) {
    if (method === 'POST') {
      return { action: 'create', entityType: 'tax', summary: withStudent('Запись в налогах', name) };
    }
    if (method === 'DELETE') {
      return { action: 'delete', entityType: 'tax', summary: withStudent('Удалена налоговая запись', name) };
    }
    return { action: 'update', entityType: 'tax', summary: withStudent('Изменена налоговая запись', name) };
  }

  if (p === '/api/auth/me' && method === 'PATCH') {
    const changed = Object.keys(rec)
      .map((key) => SETTINGS_LABELS[key] ?? key)
      .join(', ');
    return {
      action: 'update',
      entityType: 'settings',
      summary: changed ? `Настройки · ${changed}` : 'Изменены настройки',
    };
  }
  if (p === '/api/auth/telegram/unlink') {
    return { action: 'update', entityType: 'settings', summary: 'Telegram отвязан' };
  }
  if (p === '/api/auth/telegram/link-code') {
    return { action: 'update', entityType: 'settings', summary: 'Код привязки Telegram' };
  }
  if (p === '/api/auth/login') {
    return { action: 'login', entityType: 'auth', summary: 'Неудачный вход' };
  }
  if (p === '/api/bot/link' || p === '/api/bot/student/register') {
    return { action: 'update', entityType: 'settings', summary: withStudent('Привязан Telegram', name) };
  }

  const verb =
    method === 'POST' ? 'Создание' : method === 'DELETE' ? 'Удаление' : 'Изменение';
  return { action: 'other', entityType: 'other', summary: withStudent(`${verb} ${p}`, name) };
}

export async function recordActivity(input: {
  tutorId: string;
  status: ActivityStatus;
  actor: ActivityActor;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  studentId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  httpMethod?: string | null;
  httpPath?: string | null;
  httpStatus?: number | null;
}): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO activity_logs (
         tutor_id, status, actor, action, entity_type, entity_id, entity_label, student_id,
         summary, details, error_code, error_message, http_method, http_path, http_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        input.tutorId,
        input.status,
        input.actor,
        input.action,
        input.entityType,
        input.entityId ?? null,
        input.entityLabel ?? null,
        input.studentId ?? null,
        input.summary,
        input.details ?? {},
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.httpMethod ?? null,
        input.httpPath ?? null,
        input.httpStatus ?? null,
      ],
    );
  } catch {
    // Log must never break the original request.
  }
}

async function resolveTutorId(req: Request): Promise<string | null> {
  if (req.tutorId) return req.tutorId;
  const sessionId = req.session?.tutorId;
  if (sessionId) return sessionId;

  const email = typeof asRecord(req.body).email === 'string'
    ? String(asRecord(req.body).email).trim().toLowerCase()
    : '';
  if (!email) return null;
  try {
    const result = await getPool().query<{ id: string }>(
      'SELECT id FROM tutors WHERE LOWER(email) = $1',
      [email],
    );
    return result.rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

function errorFromResponse(res: Response): { code: string; message: string } | null {
  const payload = res.locals.activityError as
    | { code?: string; message?: string }
    | undefined;
  if (payload?.code || payload?.message) {
    return {
      code: payload.code ?? 'ERROR',
      message: payload.message ?? 'Request failed',
    };
  }
  return null;
}

async function loadEntityAfter(
  path: string,
  tutorId: string,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  try {
    if (path.startsWith('/api/lessons')) {
      const result = await getPool().query<{
        start_utc: Date;
        status: string;
        paid: boolean;
        notes: string | null;
        duration_min: number;
        academic_units: number;
        recurring_schedule_id: string | null;
        student_id: string;
        student_name: string;
      }>(
        `SELECT l.start_utc, l.status, l.paid, l.notes, l.duration_min, l.academic_units,
                l.recurring_schedule_id, l.student_id, s.name AS student_name
         FROM lessons l JOIN students s ON s.id = l.student_id
         WHERE l.id = $1 AND l.tutor_id = $2`,
        [entityId, tutorId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        studentId: row.student_id,
        studentName: row.student_name,
        startUtc: row.start_utc.toISOString(),
        status: row.status,
        paid: row.paid,
        notes: row.notes,
        durationMin: row.duration_min,
        academicUnits: row.academic_units,
        recurringScheduleId: row.recurring_schedule_id,
      };
    }
    if (path.startsWith('/api/students') && !path.includes('/archive') && !path.includes('/restore')) {
      const result = await getPool().query<{
        name: string;
        prepaid: string;
        debt: string;
        balance_kind: string;
        rate: string | null;
        currency: string;
        note: string | null;
      }>(
        `SELECT name, prepaid, debt, balance_kind, rate, currency, note
         FROM students WHERE id = $1 AND tutor_id = $2`,
        [entityId, tutorId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        name: row.name,
        prepaid: Number(row.prepaid),
        debt: Number(row.debt),
        balanceKind: row.balance_kind,
        rate: row.rate !== null ? Number(row.rate) : null,
        currency: row.currency,
        note: row.note,
      };
    }
    if (path.startsWith('/api/personal-events')) {
      const result = await getPool().query<{
        title: string;
        start_utc: Date;
        duration_min: number;
        notes: string | null;
      }>(
        `SELECT title, start_utc, duration_min, notes
         FROM personal_events WHERE id = $1 AND tutor_id = $2`,
        [entityId, tutorId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        title: row.title,
        startUtc: row.start_utc.toISOString(),
        durationMin: row.duration_min,
        notes: row.notes,
      };
    }
  } catch {
    return null;
  }
  return null;
}

const MOVEMENT_EFFECT: Record<string, string> = {
  replenish: 'Пополнение баланса',
  manual: 'Корректировка баланса',
  lesson_charge: 'Списание за урок',
  lesson_paid: 'Оплата урока с баланса',
  lesson_reverse: 'Отмена списания',
};

async function loadLessonBalanceEffects(
  tutorId: string,
  lessonId: string,
): Promise<ActivityEffect[]> {
  const effects: ActivityEffect[] = [];
  try {
    const moves = await getPool().query<{
      kind: string;
      prepaid_delta: string;
      debt_delta: string;
      balance_kind: string;
    }>(
      `SELECT kind, prepaid_delta, debt_delta, balance_kind
       FROM balance_movements
       WHERE tutor_id = $1 AND lesson_id = $2 AND created_at > now() - interval '20 seconds'
       ORDER BY created_at`,
      [tutorId, lessonId],
    );
    for (const row of moves.rows) {
      const prepaid = Number(row.prepaid_delta);
      const debt = Number(row.debt_delta);
      const unit = row.balance_kind === 'lessons' ? ' ур.' : '';
      const bits: string[] = [];
      if (prepaid !== 0) bits.push(`предоплата ${prepaid > 0 ? '+' : ''}${prepaid}${unit}`);
      if (debt !== 0) bits.push(`долг ${debt > 0 ? '+' : ''}${debt}${unit}`);
      const title = MOVEMENT_EFFECT[row.kind] ?? row.kind;
      effects.push({
        type: 'balance',
        summary: bits.length > 0 ? `${title} (${bits.join(', ')})` : title,
      });
    }
  } catch {
    return effects;
  }
  return effects;
}

async function loadEffects(
  path: string,
  method: string,
  body: unknown,
  tutorId: string,
  entityId: string | null,
  snap: ActivitySnapshot | undefined,
): Promise<ActivityEffect[]> {
  const effects: ActivityEffect[] = [];
  if (!entityId) return effects;

  try {
    if (path.startsWith('/api/lessons')) {
      effects.push(...(await loadLessonBalanceEffects(tutorId, entityId)));

      const recId = snap?.fields?.recurringScheduleId;
      const oldStart = snap?.fields?.startUtc;
      const movedOrDeleted =
        method === 'DELETE' || asRecord(body).startUtc !== undefined;
      if (
        movedOrDeleted &&
        typeof recId === 'string' &&
        typeof oldStart === 'string'
      ) {
        const skip = await getPool().query(
          `SELECT 1 FROM recurring_schedule_skips
           WHERE recurring_schedule_id = $1 AND start_utc = $2::timestamptz`,
          [recId, oldStart],
        );
        if (skip.rows[0]) {
          effects.push({
            type: 'recurring_skip',
            summary: 'Это занятие исключено из повторяющейся серии',
          });
        }
      }
    }
  } catch {
    return effects;
  }
  return effects;
}

export function attachActivityEffects(res: Response, effects: ActivityEffect[]): void {
  if (effects.length === 0) return;
  const prev = (res.locals.activityEffects as ActivityEffect[] | undefined) ?? [];
  res.locals.activityEffects = [...prev, ...effects];
}

export async function attachCascadeEffects(
  res: Response,
  tutorId: string,
  type: string,
  summary: string,
  items: CascadeTarget[],
): Promise<void> {
  if (items.length === 0) return;
  const effects: ActivityEffect[] = [];
  const nameCache = new Map<string, string | null>();
  for (const item of items) {
    let studentName: string | undefined;
    if (item.student_id) {
      if (!nameCache.has(item.student_id)) {
        nameCache.set(item.student_id, await loadStudentName(tutorId, item.student_id));
      }
      studentName = nameCache.get(item.student_id) ?? undefined;
    }
    const startUtc =
      typeof item.start_utc === 'string' ? item.start_utc : item.start_utc.toISOString();
    const title = item.title?.trim();
    effects.push({
      type,
      summary: title ? `${summary} · ${title}` : summary,
      entityId: item.id,
      startUtc,
      studentName,
    });
  }
  attachActivityEffects(res, effects);
}

export async function recordLessonStatusActivity(input: {
  tutorId: string;
  actor: ActivityActor;
  lessonId: string;
  studentId: string;
  studentName?: string | null;
  before: Record<string, unknown>;
  toStatus: string;
  extraEffects?: ActivityEffect[];
}): Promise<void> {
  await recordLessonDomainActivity({
    ...input,
    summaryFor: (name) => withStudent(`Статус урока: ${lessonStatusLabel(input.toStatus)}`, name),
    afterFallback: { status: input.toStatus },
  });
}

async function recordLessonDomainActivity(input: {
  tutorId: string;
  actor: ActivityActor;
  lessonId: string;
  studentId: string;
  studentName?: string | null;
  before: Record<string, unknown>;
  extraEffects?: ActivityEffect[];
  summaryFor: (name: string | null) => string;
  afterFallback: Record<string, unknown>;
}): Promise<void> {
  const after = await loadEntityAfter('/api/lessons', input.tutorId, input.lessonId);
  const studentName =
    input.studentName ??
    (typeof after?.studentName === 'string' ? after.studentName : null) ??
    (await loadStudentName(input.tutorId, input.studentId));
  const effects = [
    ...(input.extraEffects ?? []),
    ...(await loadLessonBalanceEffects(input.tutorId, input.lessonId)),
  ];
  await recordActivity({
    tutorId: input.tutorId,
    status: 'ok',
    actor: input.actor,
    action: 'update',
    entityType: 'lesson',
    entityId: input.lessonId,
    entityLabel: studentName,
    studentId: input.studentId,
    summary: input.summaryFor(studentName),
    details: {
      studentName,
      studentId: input.studentId,
      before: sanitizeJson(input.before),
      after: after ? sanitizeJson(after) : input.afterFallback,
      effects,
    },
  });
}

export async function persistHttpActivity(req: Request, res: Response): Promise<void> {
  const method = req.method.toUpperCase();
  const path = (req.originalUrl ?? req.url).split('?')[0] ?? '';
  const statusCode = res.statusCode;

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  if (SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return;
  if (statusCode >= 500) return;
  if (statusCode < 400 && SKIP_AUTH_OK.has(`${method} ${path}`)) return;

  const tutorId = await resolveTutorId(req);
  if (!tutorId) return;

  const snap = req.activitySnapshot;
  const entityId = lastUuid(path) ?? idFromJson(res.locals.activityResponse);
  let studentId =
    snap?.studentId ??
    (path.startsWith('/api/students') && entityId ? entityId : studentIdFromBody(req.body));
  let studentName = snap?.studentName ?? labelFromBody(req.body);
  if (!studentName && studentId) {
    studentName = await loadStudentName(tutorId, studentId);
  }
  if (!studentId && studentIdFromBody(req.body)) {
    studentId = studentIdFromBody(req.body);
    studentName = studentName ?? (await loadStudentName(tutorId, studentId!));
  }

  const entityLabel = snap?.entityLabel ?? labelFromBody(req.body) ?? studentName;
  const classified = classify(method, path, req.body, studentName, entityLabel);
  const appErr = errorFromResponse(res);
  const isError = statusCode >= 400;
  const summary = isError
    ? `Не удалось: ${classified.summary}${appErr?.message ? ` — ${appErr.message}` : ''}`
    : classified.summary;

  const query = asRecord(req.query);
  let after: unknown = sanitizeJson(req.body);
  if (!isError && entityId && method !== 'DELETE') {
    const fromDb = await loadEntityAfter(path, tutorId, entityId);
    if (fromDb) after = sanitizeJson(fromDb);
  }
  if (method === 'DELETE') {
    after = null;
  }
  const extraEffects = (res.locals.activityEffects as ActivityEffect[] | undefined) ?? [];
  const effects = !isError
    ? [...(await loadEffects(path, method, req.body, tutorId, entityId, snap)), ...extraEffects]
    : [];

  await recordActivity({
    tutorId,
    status: isError ? 'error' : 'ok',
    actor: req.botRole ? 'bot' : 'user',
    action: classified.action,
    entityType: classified.entityType,
    entityId,
    entityLabel,
    studentId,
    summary,
    details: {
      studentName,
      studentId,
      before: snap?.fields ? sanitizeJson(snap.fields) : undefined,
      after,
      effects,
      deleted: method === 'DELETE' || undefined,
      query: Object.keys(query).length > 0 ? sanitizeJson(query) : undefined,
    },
    errorCode: appErr?.code ?? null,
    errorMessage: appErr?.message ?? null,
    httpMethod: method,
    httpPath: path,
    httpStatus: statusCode,
  });
}

export function rememberActivityError(res: Response, err: unknown): void {
  if (err instanceof AppError) {
    res.locals.activityError = { code: err.code, message: err.message };
    return;
  }
  if (err instanceof Error) {
    res.locals.activityError = { code: 'INTERNAL', message: err.message };
  }
}
