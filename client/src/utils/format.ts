import type { BalanceKind } from '../api/types';

export function lessonCountLabel(n: number): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  let word = 'уроков';
  if (mod10 === 1 && mod100 !== 11) word = 'урок';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'урока';
  return `${abs} ${word}`;
}

export function studentCountLabel(n: number): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  let word = 'учеников';
  if (mod10 === 1 && mod100 !== 11) word = 'ученик';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'ученика';
  return `${abs} ${word}`;
}

export function fmtBalanceAmount(
  amount: number,
  kind: BalanceKind,
  currency: string,
): string {
  if (kind === 'lessons') return lessonCountLabel(amount);
  return fmtMoney(amount, currency);
}

export function fmtBalanceNet(
  prepaid: number,
  debt: number,
  kind: BalanceKind,
  currency: string,
): string {
  const net = prepaid - debt;
  if (net === 0) return '0';
  const sign = net > 0 ? '+' : '−';
  return sign + fmtBalanceAmount(Math.abs(net), kind, currency);
}

export function fmtMoney(amount: number, currency: string): string {
  const sym =
    currency === 'EUR' ? '€' : currency === 'RUB' ? '₽' : currency === 'BYN' ? 'Br' : currency;
  const n = amount.toLocaleString('ru-RU');
  return currency === 'EUR' ? `${sym}${n}` : `${n}\u202F${sym}`;
}

export function fmtByn(amount: number): string {
  const n = amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n}\u202FBr`;
}

export function fmtLessonWhen(iso: string, timezone: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function studentLessonRange(): { from: string; to: string } {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 14);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + 56);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function archivedStudentHistoryRange(): { from: string; to: string } {
  const to = new Date();
  to.setUTCFullYear(to.getUTCFullYear() + 2);
  return { from: new Date(0).toISOString(), to: to.toISOString() };
}

export function fmtTime(t: number): string {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const MONTHS_SHORT_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

/** `weekStart` is UTC midnight of the week-start calendar date. */
export function fmtWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${weekStart.getUTCDate()} ${MONTHS_SHORT_RU[weekStart.getUTCMonth()]} – ${end.getUTCDate()} ${MONTHS_SHORT_RU[end.getUTCMonth()]}`;
}

