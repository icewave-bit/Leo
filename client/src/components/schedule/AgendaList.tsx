import { useLayoutEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import { lessonsAtom, personalEventsAtom, weekStartAtom } from '../../atoms/schedule';
import { usePersonalEventGroupMap } from '../../hooks/usePersonalEventGroupMap';
import { useStudentMap } from '../../hooks/useStudentMap';
import { avatarHueStyle } from '../../utils/avatarStyle';
import { dayScheduleItems, visibleGridDays, weekDates, weekDayNames, todayDayIndex } from '../../utils/schedule';
import {
  fmtTime,
  lessonCardClass,
  lessonCardVars,
  LessonMetaLine,
  LessonNotesMark,
  LessonPayMark,
  LessonRecurrenceMark,
  TypeIcon,
} from './LessonChrome';
import {
  personalEventCardVars,
  personalEventListCardClass,
  PersonalEventGroupSwatch,
  PersonalNotesMark,
} from './PersonalEventChrome';

export function AgendaList({
  onSelect,
  onSelectPersonal,
}: {
  onSelect: (id: string) => void;
  onSelectPersonal: (id: string) => void;
}) {
  const lessons = useAtomValue(lessonsAtom);
  const personalEvents = useAtomValue(personalEventsAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tutor = useAtomValue(tutorAtom);
  const studentMap = useStudentMap();
  const groupMap = usePersonalEventGroupMap();
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const outline = tutor?.personalEventOutline ?? 'tab';
  const { full: daysFull } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);
  const todayIdx = todayDayIndex(weekStart, tz);
  const todayGroupRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const visibleDays = visibleGridDays(weekStartsOn, tutor?.hiddenWeekdays ?? []);

  useLayoutEffect(() => {
    const todayEl = todayGroupRef.current;
    if (todayEl) {
      todayEl.scrollIntoView({ block: 'start', behavior: 'auto' });
      return;
    }
    const scroller = rootRef.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [weekStart, todayIdx]);

  return (
    <div ref={rootRef} className="ag">
      {visibleDays.map((di) => {
        const items = dayScheduleItems(lessons, personalEvents, di);
        const isToday = di === todayIdx;
        return items.length === 0 && !isToday ? null : (
          <section
            key={di}
            ref={isToday ? todayGroupRef : undefined}
            className="ag__group"
          >
            <div className="ag__date">
              <span className={'ag__num' + (isToday ? ' is-today' : '')}>{dates[di]}</span>
              <span className="ag__dow">{daysFull[di]}</span>
              <span className="ag__line" />
              <span className="ag__count">{items.length}</span>
            </div>
            {items.length === 0 ? null : (
            <div className="ag__cards">
              {items.map((item) => {
                if (item.kind === 'lesson') {
                  const l = item.lesson;
                  const stu = studentMap.get(l.studentId);
                  if (!stu) return null;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={'ag__card ' + lessonCardClass(l)}
                      style={lessonCardVars(stu)}
                      onClick={() => onSelect(l.id)}
                    >
                      <LessonPayMark lesson={l} />
                      <LessonNotesMark notes={l.notes} />
                      <span className="ag__time">
                        <strong>{fmtTime(l.start)}</strong>
                        <span>{fmtTime(l.start + l.dur)}</span>
                      </span>
                      <span
                        className="avatar avatar--sm"
                        style={avatarHueStyle(stu.hue)}
                      >
                        {stu.initials}
                      </span>
                      <span className="ag__main">
                        <span className="ag__head">
                          <span className="ag__name">{stu.name}</span>
                          <TypeIcon type={l.type} />
                        </span>
                        <LessonMetaLine lesson={l} />
                      </span>
                    </button>
                  );
                }

                const event = item.event;
                const group = groupMap.get(event.groupId);
                const color = group?.color ?? '#64748b';
                return (
                  <button
                    key={event.id}
                    type="button"
                    className={
                      'ag__card ' +
                      personalEventListCardClass(outline, {
                        recurring: Boolean(event.recurringPersonalScheduleId),
                        hasNotes: Boolean(event.notes?.trim()),
                      })
                    }
                    style={personalEventCardVars(color)}
                    onClick={() => onSelectPersonal(event.id)}
                  >
                    <LessonRecurrenceMark
                      recurring={Boolean(event.recurringPersonalScheduleId)}
                      title="Повторяющееся событие"
                    />
                    <PersonalNotesMark notes={event.notes} />
                    <span className="ag__time">
                      <strong>{fmtTime(event.start)}</strong>
                      <span>{fmtTime(event.start + event.dur)}</span>
                    </span>
                    <PersonalEventGroupSwatch color={color} />
                    <span className="ag__main">
                      <span className="ag__head">
                        <span className="ag__name">{event.title}</span>
                      </span>
                      {group ? <span className="pe__group">{group.name}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
