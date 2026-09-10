import type { BalanceMovement, BalanceMovementKind, WeekStartsOn } from '../api/types';
import { fmtDateParts } from './dateKey';
import type { PaymentsPeriod } from '../atoms/payments';
import { balanceDeltaAsLessons, balanceDeltaAsMoney } from './balanceConvert';
import { fmtBalanceAmount, fmtBalanceNet, fmtLessonWhen } from './format';
import type { ViewStudent } from './schedule';

export const MOVEMENT_LABELS: Record<BalanceMovementKind, string> = {
  replenish: 'Пополнение',
  manual: 'Корректировка',
  lesson_charge: 'Списание за урок',
  lesson_paid: 'Оплата урока',
  lesson_reverse: 'Отмена списания',
};

export function periodRange(
  period: PaymentsPeriod,
  timezone: string,
  custom?: { from: string; to: string },
  now: Date = new Date(),
  weekStartsOn: WeekStartsOn = 'monday',
): { from: string; to: string; label: string } {
  if (period === 'custom') {
    const fromKey = custom?.from ?? '';
    const toKey = custom?.to ?? '';
    if (!fromKey || !toKey) {
      const defaults = defaultCustomPeriod(timezone, now);
      return periodRange('custom', timezone, defaults, now, weekStartsOn);
    }
    let fromParts = parseDateKey(fromKey);
    let toParts = parseDateKey(toKey);
    if (dateKeyCompare(fromKey, toKey) > 0) {
      [fromParts, toParts] = [toParts, fromParts];
    }
    const from = dayStartUtc(fromParts.y, fromParts.m, fromParts.d);
    const to = dayStartUtc(toParts.y, toParts.m, toParts.d);
    to.setUTCDate(to.getUTCDate() + 1);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      label: fmtDateRangeLabel(fromParts, toParts, weekStartsOn),
    };
  }

  if (period === 'all') {
    const from = new Date(0);
    return {
      from: from.toISOString(),
      to: new Date(now.getTime() + 86_400_000).toISOString(),
      label: 'Всё время',
    };
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);

  let fromDate: Date;
  let label: string;

  if (period === 'week') {
    fromDate = new Date(Date.UTC(y, m - 1, d));
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    label = '7 дней';
  } else if (period === 'month') {
    fromDate = new Date(Date.UTC(y, m - 1, 1));
    label = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      month: 'long',
      year: 'numeric',
    }).format(now);
    label = label.replace(/^./, (c) => c.toUpperCase());
  } else {
    fromDate = new Date(Date.UTC(y, m - 3, 1));
    label = '3 месяца';
  }

  const toDate = new Date(now.getTime() + 60_000);
  return { from: fromDate.toISOString(), to: toDate.toISOString(), label };
}

function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

function dateKeyCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

function dayStartUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDateRangeLabel(
  from: { y: number; m: number; d: number },
  to: { y: number; m: number; d: number },
  weekStartsOn: WeekStartsOn,
): string {
  const a = fmtDateParts(from.y, from.m, from.d, weekStartsOn);
  const b = fmtDateParts(to.y, to.m, to.d, weekStartsOn);
  if (from.y === to.y && from.m === to.m && from.d === to.d) return a;
  return `${a} – ${b}`;
}

export function dateKeyInTimezone(timezone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function defaultCustomPeriod(
  timezone: string,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = dateKeyInTimezone(timezone, now);
  const parts = parseDateKey(to);
  const from = `${parts.y}-${String(parts.m).padStart(2, '0')}-01`;
  return { from, to };
}

export const MOVEMENT_TONE: Record<
  BalanceMovementKind,
  'credit' | 'debt' | 'neutral' | 'manual'
> = {
  replenish: 'credit',
  lesson_paid: 'credit',
  lesson_charge: 'debt',
  lesson_reverse: 'neutral',
  manual: 'manual',
};

export function netBalance(prepaid: number, debt: number): number {
  return prepaid - debt;
}

/** Huge single-step prepaid jump — usually balance-kind conversion stored as replenish. */
export function isMisclassifiedReplenishMovement(m: BalanceMovement): boolean {
  if (m.kind !== 'replenish') return false;
  const before = m.prepaidAfter - m.prepaidDelta;
  if (before <= 0) return false;
  const ratio = Math.abs(m.prepaidDelta) / Math.max(Math.abs(before), 1);
  return ratio >= 10;
}

/** Unit stored on the movement (fallback: student’s current kind). */
export function movementUnitKind(
  m: BalanceMovement,
  student?: ViewStudent,
): ViewStudent['balanceKind'] {
  return m.balanceKind ?? student?.balanceKind ?? 'money';
}

export function movementsHaveMixedUnits(
  movements: BalanceMovement[],
  student?: ViewStudent,
): boolean {
  if (movements.length === 0) return false;
  const kinds = new Set(movements.map((m) => movementUnitKind(m, student)));
  return kinds.size > 1;
}

export function replenishLessonsDelta(
  m: BalanceMovement,
  student: ViewStudent | undefined,
): number | null {
  if (m.kind !== 'replenish' || isMisclassifiedReplenishMovement(m)) return null;
  return balanceDeltaAsLessons(
    m.prepaidDelta,
    movementUnitKind(m, student),
    student?.rate ?? null,
  );
}

export function movementDeltaAsMoney(
  amount: number,
  m: BalanceMovement,
  student: ViewStudent | undefined,
): number | null {
  return balanceDeltaAsMoney(amount, movementUnitKind(m, student), student?.rate ?? null);
}

export interface JournalAllocation {
  id: string;
  title: string;
  amountLabel: string;
  chargedForName: string | null;
}

export interface JournalRow extends BalanceMovement {
  studentName: string;
  chargedForName: string | null;
  balanceKind: ViewStudent['balanceKind'];
  currency: string;
  title: string;
  amountLabel: string;
  netLabel: string;
  whenLabel: string;
  tone: 'credit' | 'debt' | 'neutral' | 'manual';
  allocations?: JournalAllocation[];
  isCompoundReplenish?: boolean;
}

/** Top-level journal movements (children of a settle are nested under the parent). */
export function mainTimelineMovements(movements: BalanceMovement[]): BalanceMovement[] {
  return movements.filter((m) => m.parentMovementId == null);
}

function fmtDelta(n: number, kind: ViewStudent['balanceKind'], currency: string): string {
  if (Math.abs(n) < 1e-9) return '—';
  const sign = n > 0 ? '+' : '−';
  return sign + fmtBalanceAmount(Math.abs(n), kind, currency);
}

function movementTitle(
  m: BalanceMovement,
  students: Map<string, ViewStudent>,
): { title: string; chargedForName: string | null } {
  const chargedFor = m.chargedForStudentId
    ? students.get(m.chargedForStudentId)
    : undefined;
  const baseTitle = MOVEMENT_LABELS[m.kind];
  return {
    title: chargedFor != null ? `${baseTitle} · ${chargedFor.name}` : baseTitle,
    chargedForName: chargedFor?.name ?? null,
  };
}

function allocationAmountLabel(
  m: BalanceMovement,
  students: Map<string, ViewStudent>,
): string {
  const st = students.get(m.studentId);
  const unitKind = movementUnitKind(m, st);
  const currency = st?.currency ?? 'EUR';
  const amount = Math.abs(m.debtDelta) > 1e-9 ? Math.abs(m.debtDelta) : Math.abs(m.prepaidDelta);
  return fmtBalanceAmount(amount, unitKind, currency);
}

export function enrichMovements(
  movements: BalanceMovement[],
  students: Map<string, ViewStudent>,
  timezone: string,
): JournalRow[] {
  return movements.map((m) => {
    const st = students.get(m.studentId);
    const unitKind = movementUnitKind(m, st);
    const currency = st?.currency ?? 'EUR';
    const { title, chargedForName } = movementTitle(m, students);
    const amount = m.prepaidDelta - m.debtDelta;
    return {
      ...m,
      studentName: st?.name ?? 'Ученик',
      chargedForName,
      balanceKind: unitKind,
      currency,
      title,
      amountLabel: fmtDelta(amount, unitKind, currency),
      netLabel: fmtBalanceNet(m.prepaidAfter, m.debtAfter, unitKind, currency),
      whenLabel: fmtLessonWhen(m.occurredAt, timezone),
      tone: MOVEMENT_TONE[m.kind],
    };
  });
}

/** Nest settle children under their parent; exclude children from the main timeline. */
export function groupJournalMovements(
  rows: JournalRow[],
  allMovements: BalanceMovement[],
  students: Map<string, ViewStudent>,
): JournalRow[] {
  const childrenByParent = new Map<string, BalanceMovement[]>();
  for (const m of allMovements) {
    if (m.parentMovementId == null) continue;
    const list = childrenByParent.get(m.parentMovementId) ?? [];
    list.push(m);
    childrenByParent.set(m.parentMovementId, list);
  }

  return rows.map((row) => {
    const children = childrenByParent.get(row.id);
    if (!children || children.length === 0) return row;

    const allocations: JournalAllocation[] = [...children]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((child) => {
        const { title, chargedForName } = movementTitle(child, students);
        return {
          id: child.id,
          title,
          amountLabel: allocationAmountLabel(child, students),
          chargedForName,
        };
      });

    const isCompoundReplenish = row.kind === 'replenish';
    if (isCompoundReplenish) {
      const allocated = children.reduce(
        (sum, c) => sum + (Math.abs(c.debtDelta) > 1e-9 ? Math.abs(c.debtDelta) : Math.abs(c.prepaidDelta)),
        0,
      );
      const remainder = row.prepaidDelta - allocated;
      if (remainder > 1e-9) {
        allocations.push({
          id: `${row.id}:remainder`,
          title: 'Остаток на балансе',
          amountLabel: fmtBalanceAmount(remainder, row.balanceKind, row.currency),
          chargedForName: null,
        });
      }
    }

    return {
      ...row,
      title: isCompoundReplenish ? 'Пополнение — Списание' : row.title,
      isCompoundReplenish,
      allocations,
      tone: isCompoundReplenish ? 'credit' : row.tone,
    };
  });
}

export function buildJournalRows(
  movements: BalanceMovement[],
  students: Map<string, ViewStudent>,
  timezone: string,
): JournalRow[] {
  const main = mainTimelineMovements(movements);
  const enriched = enrichMovements(main, students, timezone);
  return groupJournalMovements(enriched, movements, students);
}

/** Balance after the operation (snapshot from DB, in that row’s units). */
export function attachRunningBalance(
  rows: JournalRow[],
): Array<JournalRow & { runningNet: string }> {
  return rows.map((r) => ({
    ...r,
    runningNet: r.netLabel,
  }));
}

export function periodDeltaSummary(
  movements: BalanceMovement[],
  student: ViewStudent | undefined,
): { net: string } | null {
  const main = mainTimelineMovements(movements);
  if (!student || main.length === 0) return null;
  if (movementsHaveMixedUnits(main, student)) return null;

  const unitKind = movementUnitKind(main[0]!, student);
  const currency = student.currency;
  const netChange = main.reduce((a, m) => a + m.prepaidDelta - m.debtDelta, 0);
  if (Math.abs(netChange) < 1e-9) {
    return { net: fmtBalanceAmount(0, unitKind, currency) };
  }
  const sign = netChange > 0 ? '+' : '−';
  return {
    net: sign + fmtBalanceAmount(Math.abs(netChange), unitKind, currency),
  };
}
