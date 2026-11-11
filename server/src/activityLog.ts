import { getPool } from './db.js';
import { activityErrorFields } from './errors.js';
import {
  formatTaxBits,
  lessonPaidDeltaAsMoney,
  movementReceivedDate,
  replenishDeltaAsMoney,
} from './taxReplenishments.js';
import type { BalanceKind } from './types.js';
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
  | 'vacation'
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

function activityEntityId(path: string, response: unknown): string | null {
  const fromPath = lastUuid(path);
  if (fromPath) return fromPath;
  const rec = asRecord(response);
  const raw = rec.id ?? (path.startsWith('/api/taxes') ? rec.movementId : undefined);
  return typeof raw === 'string' && UUID_RE.test(raw) ? raw : null;
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
    if (path.startsWith('/api/taxes')) {
      return (await loadTaxActivityFields(tutorId, id)) ?? undefined;
    }
    if (path.startsWith('/api/vacations')) {
      const result = await getPool().query<{
        student_id: string | null;
        student_name: string | null;
        start_date: string;
        end_date: string;
      }>(
        `SELECT v.student_id, s.name AS student_name,
                v.start_date::text AS start_date, v.end_date::text AS end_date
         FROM vacations v
         LEFT JOIN students s ON s.id = v.student_id
         WHERE v.id = $1 AND v.tutor_id = $2`,
        [id, tutorId],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        studentId: row.student_id ?? undefined,
        studentName: row.student_name ?? undefined,
        entityLabel: row.student_name ?? 'Снеговичок устал',
        fields: {
          studentId: row.student_id,
          startDate: row.start_date,
          endDate: row.end_date,
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

function taxSummaryBase(method: string, body: unknown): string {
  if (method === 'POST') return 'Запись в налогах';
  if (method === 'DELETE') return 'Удалена налоговая запись';
  const rec = asRecord(body);
  if (rec.taxPaid === true) return 'Налог отмечен уплаченным';
  if (rec.taxPaid === false) return 'Снята отметка об уплате налога';
  if (rec.receivedOn !== undefined && rec.comment === undefined && rec.taxPaid === undefined) {
    return 'Изменена дата в налогах';
  }
  if (rec.comment !== undefined && rec.taxPaid === undefined && rec.receivedOn === undefined) {
    return 'Изменён комментарий в налогах';
  }
  return 'Изменена налоговая запись';
}

function taxBitsFromFields(fields: Record<string, unknown>): string {
  const amount = typeof fields.amount === 'number' ? fields.amount : null;
  const currency = typeof fields.currency === 'string' ? fields.currency : null;
  const receivedOn = typeof fields.receivedOn === 'string' ? fields.receivedOn : null;
  return formatTaxBits({
    amount,
    currency,
    lessons: fields.balanceKind === 'lessons' && currency == null,
    receivedOn,
  });
}

function taxFieldsFromBody(body: unknown): Record<string, unknown> {
  const rec = asRecord(body);
  const out: Record<string, unknown> = {};
  if (typeof rec.amount === 'number') out.amount = rec.amount;
  if (typeof rec.currency === 'string') out.currency = rec.currency;
  if (typeof rec.receivedOn === 'string') out.receivedOn = rec.receivedOn;
  if (typeof rec.comment === 'string') out.comment = rec.comment;
  if (typeof rec.taxPaid === 'boolean') out.taxPaid = rec.taxPaid;
  return out;
}

async function loadTaxActivityFields(
  tutorId: string,
  movementId: string,
): Promise<ActivitySnapshot | null> {
  const result = await getPool().query<{
    student_id: string;
    student_name: string;
    currency: string;
    rate: string | null;
    kind: string;
    prepaid_delta: string;
    debt_delta: string;
    balance_kind: BalanceKind;
    received_on: string | null;
    occurred_at: Date;
    timezone: string;
    tax_paid: boolean | null;
    comment: string | null;
    manual_currency: string | null;
    manual_amount: string | null;
  }>(
    `SELECT m.student_id, s.name AS student_name, s.currency, s.rate,
            m.kind, m.prepaid_delta, m.debt_delta, m.balance_kind,
            m.received_on::text AS received_on, m.occurred_at, tu.timezone,
            t.tax_paid, t.comment, t.manual_currency, t.manual_amount
     FROM balance_movements m
     JOIN students s ON s.id = m.student_id
     JOIN tutors tu ON tu.id = m.tutor_id
     LEFT JOIN tax_replenishment_meta t ON t.balance_movement_id = m.id
     WHERE m.id = $1 AND m.tutor_id = $2`,
    [movementId, tutorId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const manualAmount = row.manual_amount != null ? Number(row.manual_amount) : null;
  const rate = row.rate != null ? Number(row.rate) : null;
  const prepaidDelta = Number(row.prepaid_delta);
  const debtDelta = Number(row.debt_delta);
  let amount: number | null = manualAmount;
  let lessons = false;
  if (amount == null && row.kind === 'lesson_paid') {
    amount = lessonPaidDeltaAsMoney(debtDelta, row.balance_kind, rate);
    if (amount == null) {
      amount = -debtDelta;
      lessons = row.balance_kind === 'lessons';
    }
  } else if (amount == null) {
    amount = replenishDeltaAsMoney(prepaidDelta, row.balance_kind, rate);
    if (amount == null) {
      amount = prepaidDelta;
      lessons = row.balance_kind === 'lessons';
    }
  }
  const currency = lessons ? null : (row.manual_currency ?? row.currency);
  const receivedOn = movementReceivedDate(
    row.received_on,
    row.occurred_at.toISOString(),
    row.timezone,
  );
  const fields: Record<string, unknown> = {
    studentId: row.student_id,
    studentName: row.student_name,
    amount,
    receivedOn,
    taxPaid: row.tax_paid ?? false,
    balanceKind: lessons ? 'lessons' : 'money',
  };
  if (currency) fields.currency = currency;
  if (row.comment) fields.comment = row.comment;

  return {
    studentId: row.student_id,
    studentName: row.student_name,
    entityLabel: row.student_name,
    fields,
  };
}

function classifyRead(
  path: string,
  name: string | null,
): { action: ActivityAction; entityType: ActivityEntityType; summary: string } {
  if (path.startsWith('/api/students')) {
    return { action: 'other', entityType: 'student', summary: withStudent('Загрузка учеников', name) };
  }
  if (path.startsWith('/api/lessons') || path.startsWith('/api/recurring-schedules')) {
    return { action: 'other', entityType: 'lesson', summary: withStudent('Загрузка уроков', name) };
  }
  if (
    path.startsWith('/api/personal-events') ||
    path.startsWith('/api/personal-event-groups') ||
    path.startsWith('/api/recurring-personal-schedules')
  ) {
    return { action: 'other', entityType: 'personal_event', summary: withStudent('Загрузка событий', name) };
  }
  if (path.startsWith('/api/schedule-slot-overrides')) {
    return { action: 'other', entityType: 'schedule', summary: 'Загрузка расписания' };
  }
  if (path.startsWith('/api/taxes')) {
    return { action: 'other', entityType: 'tax', summary: withStudent('Загрузка налогов', name) };
  }
  if (path.startsWith('/api/balance-movements')) {
    return { action: 'other', entityType: 'balance', summary: withStudent('Загрузка баланса', name) };
  }
  if (path.startsWith('/api/vacations')) {
    return { action: 'other', entityType: 'vacation', summary: withStudent('Загрузка отпуска', name) };
  }
  if (path.startsWith('/api/auth')) {
    return { action: 'other', entityType: 'auth', summary: 'Загрузка сессии' };
  }
  return { action: 'other', entityType: 'other', summary: `Запрос ${path}` };
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

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return classifyRead(p, name);
  }

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

  if (p.startsWith('/api/vacations')) {
    if (p.endsWith('/return') && method === 'POST') {
      return { action: 'restore', entityType: 'vacation', summary: withStudent('Возврат из отпуска', name) };
    }
    if (method === 'POST') {
      const studentId = asRecord(body).studentId;
      if (studentId) {
        return { action: 'create', entityType: 'vacation', summary: withStudent('Отпуск ученика', name) };
      }
      return { action: 'create', entityType: 'vacation', summary: 'Снеговичок устал' };
    }
    if (method === 'PATCH') {
      return { action: 'update', entityType: 'vacation', summary: withStudent('Изменён отпуск', name) };
    }
    return { action: 'other', entityType: 'vacation', summary: withStudent(`Изменение ${p}`, name) };
  }

  if (p.startsWith('/api/schedule-slot-overrides')) {
    return { action: 'update', entityType: 'schedule', summary: 'Изменена блокировка слота' };
  }

  if (p.startsWith('/api/taxes')) {
    const action = method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
    return {
      action,
      entityType: 'tax',
      summary: withStudent(taxSummaryBase(method, body), name),
    };
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
        clipText(input.errorCode, 120),
        clipText(input.errorMessage, 2000),
        input.httpMethod ?? null,
        input.httpPath ?? null,
        input.httpStatus ?? null,
      ],
    );
  } catch (err) {
    console.error('activity log insert failed', err);
  }
}

function clipText(value: string | null | undefined, max: number): string | null {
  if (value == null || value === '') return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
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

function errorFromResponse(res: Response): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} | null {
  const payload = res.locals.activityError as
    | { code?: string; message?: string; details?: Record<string, unknown> }
    | undefined;
  if (payload?.code || payload?.message) {
    return {
      code: payload.code ?? 'ERROR',
      message: payload.message ?? 'Request failed',
      details: payload.details,
    };
  }
  const bodyError = asRecord(asRecord(res.locals.activityResponse).error);
  if (typeof bodyError.code === 'string' || typeof bodyError.message === 'string') {
    const fromBody = asRecord(bodyError.details);
    return {
      code: typeof bodyError.code === 'string' ? bodyError.code : 'ERROR',
      message: typeof bodyError.message === 'string' ? bodyError.message : 'Request failed',
      details: Object.keys(fromBody).length > 0 ? fromBody : undefined,
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
    if (path.startsWith('/api/vacations')) {
      const result = await getPool().query<{
        start_date: string;
        end_date: string;
      }>(
        `SELECT v.start_date::text AS start_date, v.end_date::text AS end_date
         FROM vacations v
         WHERE v.id = $1 AND v.tutor_id = $2`,
        [entityId, tutorId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        startDate: row.start_date,
        endDate: row.end_date,
      };
    }
    if (path.startsWith('/api/taxes')) {
      const snap = await loadTaxActivityFields(tutorId, entityId);
      return snap?.fields ?? null;
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
  const isError = statusCode >= 400;
  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

  if (SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return;
  // Successful reads stay out of the feed; failed requests (including 5xx) are logged.
  if (!isError && isRead) return;
  if (!isError && SKIP_AUTH_OK.has(`${method} ${path}`)) return;

  const tutorId = await resolveTutorId(req);
  if (!tutorId) return;

  const snap = req.activitySnapshot;
  const entityId = activityEntityId(path, res.locals.activityResponse);
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
  let classified = classify(method, path, req.body, studentName, entityLabel);
  if (path.startsWith('/api/taxes')) {
    const merged =
      method === 'DELETE'
        ? (snap?.fields ?? {})
        : { ...(snap?.fields ?? {}), ...taxFieldsFromBody(req.body) };
    const bits = taxBitsFromFields(merged);
    const base = taxSummaryBase(method, req.body);
    classified = {
      ...classified,
      summary: withStudent(bits ? `${base} · ${bits}` : base, studentName),
    };
  }
  const appErr = errorFromResponse(res);
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
      error:
        appErr?.details && Object.keys(appErr.details).length > 0
          ? sanitizeJson(appErr.details)
          : undefined,
    },
    errorCode: appErr?.code ?? null,
    errorMessage: appErr?.message ?? null,
    httpMethod: method,
    httpPath: path,
    httpStatus: statusCode,
  });
}

export function rememberActivityError(res: Response, err: unknown): void {
  res.locals.activityError = activityErrorFields(err);
}
