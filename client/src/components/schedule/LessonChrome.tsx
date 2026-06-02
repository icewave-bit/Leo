import { STATUS_LABELS } from '../../constants/status';
import { fmtTime } from '../../utils/format';
import type { ViewLesson, ViewStudent } from '../../utils/schedule';

export function PaidDot({ paid }: { paid: boolean }) {
  return (
    <i
      className={'pdot ' + (paid ? 'pdot--paid' : 'pdot--unpaid')}
      title={paid ? 'Оплачен' : 'Не оплачен'}
    />
  );
}

export function TypeIcon({ type }: { type: 'solo' | 'group' }) {
  if (type === 'group') {
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" className="ticon" aria-hidden="true">
        <circle cx="9" cy="8" r="3.2" />
        <circle cx="16" cy="9" r="2.6" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M14 19c0-2.3 1.6-3.8 4-3.8s4 1.5 4 3.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" className="ticon" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 19c0-3.4 3-5.6 7-5.6s7 2.2 7 5.6" />
    </svg>
  );
}

export function lessonStyle(stu: ViewStudent, status: ViewLesson['status']) {
  const cancelled = status === 'cancelled';
  return {
    borderLeft: `3px solid oklch(0.62 0.15 ${stu.hue})`,
    background: `oklch(var(--tint-l) 0.04 ${stu.hue})`,
    opacity: cancelled ? 0.55 : 1,
  } as React.CSSProperties;
}

export { STATUS_LABELS, fmtTime };
