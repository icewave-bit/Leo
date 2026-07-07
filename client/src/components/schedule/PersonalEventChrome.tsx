import type { PersonalEventGroup } from '../../api/types';
import { fmtTime } from '../../utils/format';
import type { ViewPersonalEvent } from '../../utils/schedule';
import { RecurrenceIcon } from '../RecurrenceFields';
import { Icon } from '../Icon';
import {
  weekGridLessonLayoutClass,
  weekGridLessonPositionStyle,
  type WeekGridLessonLayout,
} from '../../utils/weekGridLayout';

export function personalEventCardVars(color: string): React.CSSProperties {
  return { '--pe-color': color } as React.CSSProperties;
}

export function hasPersonalNotes(notes: string | null | undefined): boolean {
  return Boolean(notes?.trim());
}

export function PersonalNotesMark({ notes }: { notes: string | null }) {
  if (!hasPersonalNotes(notes)) return null;
  return (
    <span className="pe__mark pe__mark--notes" aria-hidden="true">
      <Icon icon="text-box" size={11} />
    </span>
  );
}

export function PersonalEventCard({
  event,
  group,
  layout,
  pxPerHour,
  start,
  ghost,
  onPointerDown,
  onClick,
}: {
  event: ViewPersonalEvent;
  group: PersonalEventGroup | undefined;
  layout?: WeekGridLessonLayout;
  pxPerHour: number;
  start?: number;
  ghost?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
}) {
  const color = group?.color ?? '#64748b';
  const slotStart = start ?? event.start;
  const top = slotStart * pxPerHour;
  const height = event.dur * pxPerHour - 4;
  const tight = height < pxPerHour * 0.72;
  const colsClass = weekGridLessonLayoutClass(layout);

  return (
    <button
      type="button"
      className={
        'pe' +
        (hasPersonalNotes(event.notes) ? ' pe--has-notes' : '') +
        (event.recurringPersonalScheduleId ? ' pe--recur' : '') +
        (tight ? ' pe--tight' : '') +
        (ghost ? ' pe--ghost' : '') +
        (colsClass ? ` ${colsClass}` : '')
      }
      style={{
        top,
        height,
        ...personalEventCardVars(color),
        ...weekGridLessonPositionStyle(layout),
      }}
      title={
        `${event.title} · ${fmtTime(slotStart)}–${fmtTime(slotStart + event.dur)}` +
        (hasPersonalNotes(event.notes) ? ` · ${event.notes!.trim()}` : '')
      }
      aria-label={`${event.title}, ${fmtTime(slotStart)}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {event.recurringPersonalScheduleId ? (
        <RecurrenceIcon title="Повторяющееся событие" />
      ) : null}
      <PersonalNotesMark notes={event.notes} />
      <span className="pe__title">{event.title}</span>
      {!tight ? (
        <span className="pe__time">
          {fmtTime(slotStart)} – {fmtTime(slotStart + event.dur)}
        </span>
      ) : null}
    </button>
  );
}
