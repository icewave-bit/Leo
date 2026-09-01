import type { ActivityActor, ActivityEntityType, ActivityLogEntry, ActivityStatus } from '../api/types';
import type { ViewStudent } from './schedule';

export const ENTITY_LABELS: Record<ActivityEntityType, string> = {
  student: 'Ученик',
  lesson: 'Урок',
  personal_event: 'Событие',
  settings: 'Настройки',
  balance: 'Баланс',
  tax: 'Налоги',
  schedule: 'Расписание',
  auth: 'Вход',
  other: 'Другое',
};

export const ACTOR_LABELS: Record<ActivityActor, string> = {
  user: 'Вы',
  system: 'Система',
  bot: 'Бот',
};

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  ok: 'Успех',
  error: 'Ошибка',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Имя',
  title: 'Название',
  startUtc: 'Время',
  status: 'Статус',
  paid: 'Оплачен',
  notes: 'Заметка',
  note: 'Заметка',
  prepaid: 'Предоплата',
  debt: 'Долг',
  balanceKind: 'Тип баланса',
  rate: 'Ставка',
  currency: 'Валюта',
  durationMin: 'Длительность',
  academicUnits: 'Ак. часов',
  studentId: 'Ученик',
  restoreBalance: 'Вернуть баланс',
  taxRatePercent: 'Ставка налога',
  taxDisplayCurrency: 'Валюта налога',
  academicHourMin: 'Ак. час, мин',
  weekStartsOn: 'Начало недели',
  defaultReplenishBalanceKind: 'Тип пополнения',
  hiddenWeekdays: 'Скрытые дни',
  telegramNotify: 'Уведомления Telegram',
  telegramUsername: 'Telegram',
  meetUrl: 'Ссылка',
  hue: 'Цвет',
  tz: 'Часовой пояс',
  isGroup: 'Группа',
  members: 'Состав',
  excludeFromTaxes: 'Без налогов',
  billingStudentId: 'Плательщик',
  receivedOn: 'Дата поступления',
  comment: 'Комментарий',
  taxPaid: 'Налог уплачен',
  amount: 'Сумма',
  weekday: 'День недели',
  startMinutes: 'Начало слота',
  hasEvent: 'Есть событие',
  groupId: 'Группа',
  unlinkTelegram: 'Отвязать Telegram',
};

const LESSON_STATUS: Record<string, string> = {
  planned: 'Запланирован',
  completed: 'Проведён',
  cancelled: 'Отменён',
  no_show: 'Не пришёл',
};

export function actionTitle(summary: string, studentName: string | null): string {
  if (studentName && summary.endsWith(` · ${studentName}`)) {
    return summary.slice(0, -(studentName.length + 3));
  }
  return summary;
}

export function logRequestLine(entry: ActivityLogEntry): string | null {
  const req = [entry.httpMethod, entry.httpPath].filter(Boolean).join(' ');
  const bits: string[] = [];
  if (req) bits.push(req);
  if (entry.httpStatus != null) bits.push(String(entry.httpStatus));
  if (entry.errorCode) bits.push(entry.errorCode);
  return bits.length > 0 ? bits.join(' · ') : null;
}

export function collapsedLogPreview(entry: ActivityLogEntry, timezone: string): string[] {
  const story = buildLogStory(entry, timezone);
  const lines: string[] = [];
  if (story.error?.message) {
    const alreadyInRequest = Boolean(entry.errorCode && story.error.message === entry.errorCode);
    if (!alreadyInRequest) lines.push(story.error.message);
  }
  if (story.relocation) {
    lines.push(formatMovePreview(story.relocation.fromIso, story.relocation.toIso, timezone));
  } else if (story.changes[0]) {
    const change = story.changes[0];
    lines.push(
      change.from ? `${change.label}: ${change.from} → ${change.to}` : `${change.label}: ${change.to}`,
    );
  }
  if (story.effects.length === 1) {
    lines.push(formatEffectSummary(story.effects[0], timezone));
  } else if (story.effects.length > 1) {
    lines.push(
      `${formatEffectSummary(story.effects[0], timezone)} · ещё ${story.effects.length - 1}`,
    );
  }
  return lines.slice(0, 2);
}

function dateTimeParts(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    day: get('day'),
    month: get('month'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

export function fmtLogClock(iso: string, timezone: string): string {
  const p = dateTimeParts(iso, timezone);
  return `${p.hour}:${p.minute}`;
}

/** Compact datetime for log details: 31.08 19:00 — no weekday, no year. */
export function fmtCompactWhen(iso: string, timezone: string): string {
  const p = dateTimeParts(iso, timezone);
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

export function formatMovePreview(fromIso: string, toIso: string, timezone: string): string {
  if (logDayKey(fromIso, timezone) === logDayKey(toIso, timezone)) {
    return `${fmtLogClock(fromIso, timezone)} → ${fmtLogClock(toIso, timezone)}`;
  }
  return `${fmtCompactWhen(fromIso, timezone)} → ${fmtCompactWhen(toIso, timezone)}`;
}

export function fmtLogWhen(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

export function logDayKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function fmtLogDay(iso: string, timezone: string): string {
  const key = logDayKey(iso, timezone);
  const today = logDayKey(new Date().toISOString(), timezone);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = logDayKey(yesterdayDate.toISOString(), timezone);
  if (key === today) return 'Сегодня';
  if (key === yesterday) return 'Вчера';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

export function groupLogsByDay(
  items: ActivityLogEntry[],
  timezone: string,
): { key: string; label: string; items: ActivityLogEntry[] }[] {
  const groups: { key: string; label: string; items: ActivityLogEntry[] }[] = [];
  for (const item of items) {
    const key = logDayKey(item.occurredAt, timezone);
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: fmtLogDay(item.occurredAt, timezone), items: [item] });
    }
  }
  return groups;
}

export function entryStudentName(
  entry: ActivityLogEntry,
  students: Map<string, ViewStudent>,
): string | null {
  const fromDetails = entry.details.studentName;
  if (typeof fromDetails === 'string' && fromDetails.trim()) return fromDetails.trim();
  if (entry.studentId) {
    const live = students.get(entry.studentId);
    if (live) return live.name;
  }
  if (entry.entityType === 'student' && entry.entityLabel) return entry.entityLabel;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function looksLikeIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function formatValue(value: unknown, timezone: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value === '[redacted]') return 'скрыто';
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (LESSON_STATUS[value]) return LESSON_STATUS[value];
    if (looksLikeIso(value)) return fmtCompactWhen(value, timezone);
    return value;
  }
  return JSON.stringify(value);
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

const HIDDEN_FIELDS = new Set(['recurringScheduleId', 'studentId']);

function formatField(key: string, value: unknown, timezone: string): string {
  if (key === 'durationMin' && typeof value === 'number') return `${value} мин`;
  if (key === 'academicUnits' && typeof value === 'number') return `${value} ак. ч.`;
  if (key === 'startUtc' && typeof value === 'string' && looksLikeIso(value)) {
    return fmtCompactWhen(value, timezone);
  }
  return formatValue(value, timezone);
}

function durationSuffix(fields: Record<string, unknown>): string {
  return typeof fields.durationMin === 'number' ? ` · ${fields.durationMin} мин` : '';
}

export type LogStoryFact = { label: string; value: string };
export type LogStoryChange = { label: string; from: string | null; to: string };
export type LogStoryEffect = {
  type: string;
  summary: string;
  startUtc?: string;
  studentName?: string;
};
export type LogStory = {
  facts: LogStoryFact[];
  relocation: { from: string; to: string; fromIso: string; toIso: string } | null;
  changes: LogStoryChange[];
  effects: LogStoryEffect[];
  deleted: boolean;
  error: { code: string | null; message: string } | null;
  actor: string;
};

export function formatEffectSummary(effect: LogStoryEffect, timezone: string): string {
  const parts = [effect.summary];
  if (effect.startUtc) parts.push(formatValue(effect.startUtc, timezone));
  if (effect.studentName) parts.push(effect.studentName);
  return parts.join(' · ');
}

export function effectsOf(details: Record<string, unknown>): LogStoryEffect[] {
  const raw = details.effects;
  if (!Array.isArray(raw)) return [];
  const out: LogStoryEffect[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.summary !== 'string' || !rec.summary.trim()) continue;
    out.push({
      type: typeof rec.type === 'string' ? rec.type : 'other',
      summary: rec.summary.trim(),
      startUtc: typeof rec.startUtc === 'string' ? rec.startUtc : undefined,
      studentName: typeof rec.studentName === 'string' ? rec.studentName : undefined,
    });
  }
  return out;
}

export function buildLogStory(entry: ActivityLogEntry, timezone: string): LogStory {
  const before = asRecord(entry.details.before);
  const deleted = entry.details.deleted === true || entry.details.after === null;
  const after = deleted ? {} : asRecord(entry.details.after);
  const studentName =
    (typeof after.studentName === 'string' && after.studentName.trim()) ||
    (typeof entry.details.studentName === 'string' && entry.details.studentName.trim()) ||
    (typeof before.studentName === 'string' && before.studentName.trim()) ||
    null;

  const facts: LogStoryFact[] = [];
  if (studentName) facts.push({ label: 'Ученик', value: studentName });

  const title = (after.title ?? before.title) as unknown;
  if (typeof title === 'string' && title.trim() && entry.entityType === 'personal_event') {
    facts.push({ label: 'Событие', value: title.trim() });
  }

  const startBefore = typeof before.startUtc === 'string' ? before.startUtc : null;
  const startAfter = typeof after.startUtc === 'string' ? after.startUtc : null;
  const moved = Boolean(startBefore && startAfter && startBefore !== startAfter);
  const createLike = Object.keys(before).length === 0 && (entry.action === 'create' || Boolean(startAfter));
  const relocation = moved
    ? {
        from: fmtCompactWhen(startBefore!, timezone),
        to: fmtCompactWhen(startAfter!, timezone),
        fromIso: startBefore!,
        toIso: startAfter!,
      }
    : null;

  const whenIso = startAfter ?? startBefore;
  if (!moved && whenIso) {
    facts.push({
      label: deleted ? 'Когда было' : 'Когда',
      value: `${fmtCompactWhen(whenIso, timezone)}${durationSuffix(after.durationMin != null ? after : before)}`,
    });
  }

  const unchangedFactKeys = ['status', 'paid', 'notes', 'durationMin', 'academicUnits'] as const;
  for (const key of unchangedFactKeys) {
    if (key === 'durationMin' && whenIso && !moved) continue;
    const val = after[key] ?? before[key];
    if (val === undefined || val === null || val === '') continue;
    const changed =
      before[key] !== undefined &&
      after[key] !== undefined &&
      JSON.stringify(before[key]) !== JSON.stringify(after[key]);
    if (changed) continue;
    facts.push({ label: fieldLabel(key), value: formatField(key, val, timezone) });
  }

  if (createLike) {
    for (const [key, val] of Object.entries(after)) {
      if (HIDDEN_FIELDS.has(key) || key === 'studentName' || key === 'startUtc') continue;
      if (key === 'durationMin' && whenIso) continue;
      if (val === undefined || val === null || val === '') continue;
      if (facts.some((fact) => fact.label === fieldLabel(key))) continue;
      facts.push({ label: fieldLabel(key), value: formatField(key, val, timezone) });
    }
  }

  const changes: LogStoryChange[] = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const key of keys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (key === 'studentName' && JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (key === 'startUtc' && (relocation || whenIso)) continue;
    if (key === 'durationMin' && (relocation || whenIso) && JSON.stringify(before[key]) === JSON.stringify(after[key])) {
      continue;
    }
    const prev = before[key];
    const next = after[key];
    if (prev === undefined && next === undefined) continue;
    if (JSON.stringify(prev) === JSON.stringify(next)) continue;
    if (prev === undefined && createLike) continue;
    if (prev === undefined) {
      changes.push({ label: fieldLabel(key), from: null, to: formatField(key, next, timezone) });
    } else if (next === undefined) {
      changes.push({ label: fieldLabel(key), from: formatField(key, prev, timezone), to: '—' });
    } else {
      changes.push({
        label: fieldLabel(key),
        from: formatField(key, prev, timezone),
        to: formatField(key, next, timezone),
      });
    }
  }

  const query = asRecord(entry.details.query);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    changes.push({ label: fieldLabel(key), from: null, to: formatField(key, value, timezone) });
  }

  return {
    facts,
    relocation,
    changes,
    effects: effectsOf(entry.details),
    deleted,
    error:
      entry.errorCode || entry.errorMessage
        ? { code: entry.errorCode, message: entry.errorMessage ?? 'Ошибка' }
        : null,
    actor: ACTOR_LABELS[entry.actor],
  };
}
