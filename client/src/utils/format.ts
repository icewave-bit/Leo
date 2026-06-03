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
  const sym = currency === 'EUR' ? '€' : currency === 'RUB' ? '₽' : currency;
  const n = amount.toLocaleString('ru-RU');
  return currency === 'EUR' ? `${sym}${n}` : `${n}\u202F${sym}`;
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

export function fmtTime(t: number): string {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const MONTHS_SHORT_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

export function fmtWeekLabel(weekStart: Date, timezone: string): string {
  const end = addDays(weekStart, 6);
  const startDay = dayInTz(weekStart, timezone);
  const endDay = dayInTz(end, timezone);
  const startMonth = monthInTz(weekStart, timezone);
  const endMonth = monthInTz(end, timezone);
  return `${startDay} ${MONTHS_SHORT_RU[startMonth]} – ${endDay} ${MONTHS_SHORT_RU[endMonth]}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function dayInTz(iso: Date, tz: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(iso),
  );
}

function monthInTz(iso: Date, tz: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(iso),
  ) - 1;
}

