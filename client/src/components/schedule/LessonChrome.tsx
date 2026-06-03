import { PAY_LABELS, STATUS_LABELS } from '../../constants/status';
import { fmtTime } from '../../utils/format';
import type { ViewLesson, ViewStudent } from '../../utils/schedule';

export function lessonCardVars(student: ViewStudent): React.CSSProperties {
  return { '--ev-hue': String(student.hue) } as React.CSSProperties;
}

export function lessonCardClass(
  lesson: Pick<ViewLesson, 'status' | 'paid' | 'type'>,
  opts?: { tight?: boolean; ghost?: boolean },
): string {
  return [
    'ev',
    `ev--${lesson.status}`,
    lesson.paid ? 'ev--paid' : 'ev--unpaid',
    lesson.type === 'group' ? 'ev--group' : '',
    opts?.tight ? 'ev--tight' : '',
    opts?.ghost ? 'ev--ghost' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Unpaid completed lesson — small corner mark (no circles that clip). */
export function LessonPayMark({
  lesson,
}: {
  lesson: Pick<ViewLesson, 'status' | 'paid'>;
}) {
  if (lesson.paid || lesson.status !== 'completed') return null;
  return <span className="ev__mark" aria-label="Не оплачен" />;
}

/** List / timeline caption — one quiet line, accent only when unpaid. */
export function LessonMetaLine({
  lesson,
}: {
  lesson: Pick<ViewLesson, 'status' | 'paid'>;
}) {
  const status = lesson.status;
  if (status === 'planned') return null;

  const statusText = STATUS_LABELS[status].ru.toLowerCase();
  const showPay = status === 'completed';

  return (
    <p className="ev-meta">
      <span className="ev-meta__status">{statusText}</span>
      {showPay ? (
        <>
          <span className="ev-meta__sep"> · </span>
          <span className={lesson.paid ? 'ev-meta__ok' : 'ev-meta__warn'}>
            {lesson.paid ? PAY_LABELS.paid.ru.toLowerCase() : PAY_LABELS.unpaid.ru.toLowerCase()}
          </span>
        </>
      ) : null}
    </p>
  );
}

export function lessonGridHint(lesson: Pick<ViewLesson, 'status' | 'paid'>): string | null {
  if (lesson.status === 'planned') return null;
  const label = STATUS_LABELS[lesson.status].short;
  if (lesson.status === 'completed' && !lesson.paid) return `${label} · долг`;
  return label;
}

export function lessonEventLabel(lesson: Pick<ViewLesson, 'status' | 'paid'>): string {
  const status = STATUS_LABELS[lesson.status].ru;
  if (lesson.status !== 'completed') return status;
  const pay = lesson.paid ? PAY_LABELS.paid.ru : PAY_LABELS.unpaid.ru;
  return `${status}, ${pay}`;
}

export function TypeIcon({ type }: { type: 'solo' | 'group' }) {
  if (type === 'group') {
    return (
      <svg viewBox="0 0 24 24" width="12" height="12" className="ev-type" aria-hidden="true">
        <circle cx="9" cy="8" r="3.2" />
        <circle cx="16" cy="9" r="2.6" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M14 19c0-2.3 1.6-3.8 4-3.8s4 1.5 4 3.8" />
      </svg>
    );
  }
  return null;
}

export { STATUS_LABELS, PAY_LABELS, fmtTime };
