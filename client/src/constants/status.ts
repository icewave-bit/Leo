import type { UiLessonStatus } from '../utils/schedule';

export const STATUS_LABELS: Record<
  UiLessonStatus,
  { ru: string; short: string; dot: string }
> = {
  planned: { ru: 'Запланирован', short: 'План', dot: 'var(--c-primary)' },
  completed: { ru: 'Проведён', short: 'Проведён', dot: 'var(--c-credit)' },
  cancelled: { ru: 'Отменён', short: 'Отменён', dot: 'var(--c-muted)' },
  'no-show': { ru: 'Не пришёл', short: 'Пропуск', dot: 'var(--c-debt)' },
};

export const PAY_LABELS = {
  paid: { ru: 'Оплачен', short: 'Оплачен' },
  unpaid: { ru: 'Не оплачен', short: 'Долг' },
} as const;
