import type { UiLessonStatus } from '../utils/schedule';

export const STATUS_LABELS: Record<
  UiLessonStatus,
  { ru: string; dot: string }
> = {
  planned: { ru: 'Запланирован', dot: 'var(--c-primary)' },
  completed: { ru: 'Проведён', dot: 'var(--c-credit)' },
  cancelled: { ru: 'Отменён', dot: 'var(--c-muted)' },
  'no-show': { ru: 'Не пришёл', dot: 'var(--c-debt)' },
};
