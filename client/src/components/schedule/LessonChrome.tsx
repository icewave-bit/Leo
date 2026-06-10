import { PAY_LABELS, STATUS_LABELS } from '../../constants/status';
import { lessonDebtClosed } from '../../utils/lessonPay';
import { fmtTime } from '../../utils/format';
import type { ViewLesson, ViewStudent } from '../../utils/schedule';
import { RecurrenceIcon } from '../RecurrenceFields';
import { NotesPaperIcon } from '../icons/NotesPaperIcon';

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;

/** Pure Cyrillic names render optically larger in Hanken Grotesk at the same font-size. */
export function lessonNameClass(name: string): string {
  let hasCy = false;
  let hasLat = false;
  for (const ch of name) {
    if (LATIN.test(ch)) hasLat = true;
    else if (CYRILLIC.test(ch)) hasCy = true;
    if (hasCy && hasLat) return 'ev__name';
  }
  return hasCy ? 'ev__name ev__name--cy' : 'ev__name';
}

export function lessonCardVars(student: ViewStudent): React.CSSProperties {
  return { '--ev-hue': String(student.hue) } as React.CSSProperties;
}

export function lessonCardClass(
  lesson: Pick<ViewLesson, 'status' | 'paid' | 'balanceCharged' | 'chargeDebtDelta' | 'balancePaidApplied' | 'type'>,
  opts?: { tight?: boolean; ghost?: boolean },
): string {
  const settled =
    lesson.status === 'completed' ? lessonDebtClosed(lesson) : lesson.paid;
  return [
    'ev',
    `ev--${lesson.status}`,
    settled ? 'ev--paid' : 'ev--unpaid',
    lesson.type === 'group' ? 'ev--group' : '',
    opts?.tight ? 'ev--tight' : '',
    opts?.ghost ? 'ev--ghost' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Conducted lesson — corner check: green if lesson debt closed, red if open debt. */
export function LessonPayMark({
  lesson,
}: {
  lesson: Pick<
    ViewLesson,
    'status' | 'paid' | 'balanceCharged' | 'chargeDebtDelta' | 'balancePaidApplied'
  >;
}) {
  if (lesson.status !== 'completed' || !lesson.balanceCharged) return null;
  const ok = lessonDebtClosed(lesson);
  return (
    <span
      className={'ev__mark' + (ok ? ' ev__mark--ok' : ' ev__mark--debt')}
      aria-label={ok ? 'Долг по уроку закрыт' : PAY_LABELS.unpaid.ru}
    >
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
        <path
          d="M2.2 6.1 4.8 8.6 9.8 3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function LessonMetaLine({
  lesson,
}: {
  lesson: Pick<
    ViewLesson,
    'status' | 'paid' | 'balanceCharged' | 'chargeDebtDelta' | 'balancePaidApplied'
  >;
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
          <span
            className={
              lessonDebtClosed(lesson) ? 'ev-meta__ok' : 'ev-meta__warn'
            }
          >
            {lessonDebtClosed(lesson)
              ? PAY_LABELS.paid.ru.toLowerCase()
              : PAY_LABELS.unpaid.ru.toLowerCase()}
          </span>
        </>
      ) : null}
    </p>
  );
}

export function lessonGridHint(
  lesson: Pick<ViewLesson, 'status'>,
): string | null {
  if (lesson.status === 'planned' || lesson.status === 'completed') return null;
  return STATUS_LABELS[lesson.status].short;
}

export function lessonEventLabel(
  lesson: Pick<
    ViewLesson,
    'status' | 'paid' | 'balanceCharged' | 'chargeDebtDelta' | 'balancePaidApplied'
  >,
): string {
  const status = STATUS_LABELS[lesson.status].ru;
  if (lesson.status !== 'completed') return status;
  const pay = lessonDebtClosed(lesson) ? PAY_LABELS.paid.ru : PAY_LABELS.unpaid.ru;
  return `${status}, ${pay}`;
}

export function hasLessonNotes(notes: string | null | undefined): boolean {
  return Boolean(notes?.trim());
}

/** Bottom-right — recurrence takes the corner; notes shift left when both are present. */
export function LessonRecurrenceMark({ recurring }: { recurring: boolean }) {
  if (!recurring) return null;
  return (
    <span className="ev__recur" aria-label="Повторяющийся урок" title="Повторяющийся урок">
      <RecurrenceIcon />
    </span>
  );
}

/** Bottom-right badge — kept away from the top-right pay tick (ev__mark). */
export function LessonNotesMark({ notes }: { notes: string | null | undefined }) {
  if (!hasLessonNotes(notes)) return null;
  const text = notes!.trim();
  return (
    <span className="ev__notes" aria-label="Есть напоминание" title={text}>
      <NotesPaperIcon size={10} />
    </span>
  );
}

/** Mobile week-grid: alternates name (5s) and time (2s). */
export function LessonCardRotatingLabel({
  name,
  time,
  groupIcon,
}: {
  name: string;
  time: string;
  groupIcon?: React.ReactNode;
}) {
  return (
    <span className="ev__rot" aria-hidden="true">
      <span className="ev__rot-slot ev__rot-slot--name">
        <span className="ev__head">
          <span className={lessonNameClass(name)}>{name}</span>
          {groupIcon}
        </span>
      </span>
      <span className="ev__rot-slot ev__rot-slot--time">
        <span className="ev__time">{time}</span>
      </span>
    </span>
  );
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
