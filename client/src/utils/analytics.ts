import type { BalanceMovement, Lesson, LessonStatus } from '../api/types';
import { balanceDeltaAsMoney } from './balanceConvert';
import { fmtMoney } from './format';
import {
  isMisclassifiedReplenishMovement,
  movementDeltaAsMoney,
  replenishLessonsDelta,
} from './paymentJournal';
import type { ViewStudent } from './schedule';

export const STATUS_LABELS: Record<LessonStatus, string> = {
  planned: 'Запланировано',
  completed: 'Проведено',
  cancelled: 'Отменено',
  no_show: 'Неявка',
};

export const STATUS_TONES: Record<LessonStatus, string> = {
  planned: 'primary',
  completed: 'credit',
  cancelled: 'muted',
  no_show: 'debt',
};

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export interface AnalyticsKpis {
  totalLessons: number;
  completedLessons: number;
  cancelledLessons: number;
  noShowLessons: number;
  plannedLessons: number;
  academicHours: number;
  completionRate: number | null;
  cancellationRate: number | null;
  soloLessons: number;
  groupLessons: number;
  recurringShare: number | null;
  activeStudents: number;
}

export interface TimelineBucket {
  key: string;
  label: string;
  count: number;
  hours: number;
}

export interface StatusSlice {
  status: LessonStatus;
  label: string;
  count: number;
  pct: number;
  tone: string;
}

export interface WeekdayBucket {
  day: number;
  label: string;
  count: number;
}

export interface CurrencyFinance {
  currency: string;
  replenishments: number;
  lessonCharges: number;
  totalDebt: number;
  totalPrepaid: number;
  netPortfolio: number;
  studentCount: number;
}

export interface ReplenishmentIncomeBucket {
  key: string;
  label: string;
  lessons: number;
}

function weekdayInTimezone(iso: string, timezone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(
    new Date(iso),
  );
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[wd] ?? 0;
}

function dateKeyInTimezone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function fmtDayLabel(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d} ${months[m - 1]}`;
}

function fmtWeekLabel(fromKey: string): string {
  const [, m, d] = fromKey.split('-').map(Number);
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d} ${months[m - 1]}`;
}

function weekStartKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

export function computeKpis(
  lessons: Lesson[],
  students: ViewStudent[],
  studentId: string | null,
): AnalyticsKpis {
  const completed = lessons.filter((l) => l.status === 'completed').length;
  const cancelled = lessons.filter((l) => l.status === 'cancelled').length;
  const noShow = lessons.filter((l) => l.status === 'no_show').length;
  const planned = lessons.filter((l) => l.status === 'planned').length;
  const academicHours = lessons
    .filter((l) => l.status !== 'cancelled')
    .reduce((sum, l) => sum + l.academicUnits, 0);
  const solo = lessons.filter((l) => l.type === 'solo').length;
  const group = lessons.filter((l) => l.type === 'group').length;
  const recurring = lessons.filter((l) => l.recurringScheduleId).length;

  const finished = completed + cancelled + noShow;
  const activeStudents = studentId
    ? 1
    : new Set(lessons.map((l) => l.studentId)).size || students.length;

  return {
    totalLessons: lessons.length,
    completedLessons: completed,
    cancelledLessons: cancelled,
    noShowLessons: noShow,
    plannedLessons: planned,
    academicHours,
    completionRate: finished > 0 ? completed / finished : null,
    cancellationRate: finished > 0 ? (cancelled + noShow) / finished : null,
    soloLessons: solo,
    groupLessons: group,
    recurringShare: lessons.length > 0 ? recurring / lessons.length : null,
    activeStudents,
  };
}

export function computeTimeline(
  lessons: Lesson[],
  timezone: string,
  bucketByWeek: boolean,
): TimelineBucket[] {
  const map = new Map<string, { count: number; hours: number }>();

  for (const lesson of lessons) {
    if (lesson.status === 'cancelled') continue;
    const dayKey = dateKeyInTimezone(lesson.startUtc, timezone);
    const key = bucketByWeek ? weekStartKey(dayKey) : dayKey;
    const entry = map.get(key) ?? { count: 0, hours: 0 };
    entry.count += 1;
    entry.hours += lesson.academicUnits;
    map.set(key, entry);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { count, hours }]) => ({
      key,
      label: bucketByWeek ? fmtWeekLabel(key) : fmtDayLabel(key),
      count,
      hours,
    }));
}

export function computeStatusBreakdown(lessons: Lesson[]): StatusSlice[] {
  const total = lessons.length;
  if (total === 0) return [];

  const counts: Record<LessonStatus, number> = {
    planned: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
  };
  for (const l of lessons) counts[l.status] += 1;

  return (Object.keys(counts) as LessonStatus[]).map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: counts[status],
    pct: (counts[status] / total) * 100,
    tone: STATUS_TONES[status],
  }));
}

export function computeWeekdayDistribution(lessons: Lesson[], timezone: string): WeekdayBucket[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const l of lessons) {
    if (l.status === 'cancelled') continue;
    counts[weekdayInTimezone(l.startUtc, timezone)] += 1;
  }
  return counts.map((count, day) => ({
    day,
    label: WEEKDAY_LABELS[day],
    count,
  }));
}

export function computeFinanceByCurrency(
  movements: BalanceMovement[],
  students: ViewStudent[],
  studentId: string | null,
): CurrencyFinance[] {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const byCurrency = new Map<string, CurrencyFinance>();

  const ensure = (currency: string): CurrencyFinance => {
    let row = byCurrency.get(currency);
    if (!row) {
      row = {
        currency,
        replenishments: 0,
        lessonCharges: 0,
        totalDebt: 0,
        totalPrepaid: 0,
        netPortfolio: 0,
        studentCount: 0,
      };
      byCurrency.set(currency, row);
    }
    return row;
  };

  for (const m of movements) {
    const st = studentMap.get(m.studentId);
    if (!st) continue;
    const row = ensure(st.currency);
    if (m.kind === 'replenish' && !isMisclassifiedReplenishMovement(m)) {
      const money = movementDeltaAsMoney(m.prepaidDelta, m, st);
      if (money != null) row.replenishments += money;
    }
    if (m.kind === 'lesson_charge') {
      const money = movementDeltaAsMoney(m.debtDelta, m, st);
      if (money != null) row.lessonCharges += money;
    }
  }

  const portfolioStudents = studentId
    ? students.filter((s) => s.id === studentId)
    : students;

  for (const st of portfolioStudents) {
    const row = ensure(st.currency);
    row.studentCount += 1;
    const prepaid = balanceDeltaAsMoney(st.prepaid, st.balanceKind, st.rate);
    const debt = balanceDeltaAsMoney(st.debt, st.balanceKind, st.rate);
    if (prepaid != null) row.totalPrepaid += prepaid;
    if (debt != null) row.totalDebt += debt;
  }

  for (const row of byCurrency.values()) {
    row.netPortfolio = row.totalPrepaid - row.totalDebt;
  }

  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function computeReplenishmentIncomeTimeline(
  movements: BalanceMovement[],
  students: ViewStudent[],
  timezone: string,
  bucketByWeek: boolean,
  studentId: string | null,
): ReplenishmentIncomeBucket[] {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const map = new Map<string, number>();

  for (const m of movements) {
    if (m.kind !== 'replenish' || isMisclassifiedReplenishMovement(m)) continue;
    if (studentId && m.studentId !== studentId) continue;
    const st = studentMap.get(m.studentId);
    const lessons = replenishLessonsDelta(m, st);
    if (lessons == null || lessons <= 0) continue;

    const dayKey = dateKeyInTimezone(m.occurredAt, timezone);
    const key = bucketByWeek ? weekStartKey(dayKey) : dayKey;
    map.set(key, (map.get(key) ?? 0) + lessons);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, lessons]) => ({
      key,
      label: bucketByWeek ? fmtWeekLabel(key) : fmtDayLabel(key),
      lessons,
    }));
}

export function totalReplenishmentLessons(buckets: ReplenishmentIncomeBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.lessons, 0);
}

export function fmtPct(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

export function fmtFinanceAmount(amount: number, currency: string): string {
  return fmtMoney(amount, currency);
}

export function shouldBucketByWeek(fromIso: string, toIso: string): boolean {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const days = (to - from) / 86_400_000;
  return days > 45;
}

export function portfolioSummary(students: ViewStudent[], studentId: string | null) {
  const list = studentId ? students.filter((s) => s.id === studentId) : students;
  const withDebt = list.filter((s) => s.debt > 0).length;
  const withPrepaid = list.filter((s) => s.prepaid > 0).length;
  const lessonBalance = list.filter((s) => s.balanceKind === 'lessons').length;
  return { withDebt, withPrepaid, lessonBalance, total: list.length };
}
