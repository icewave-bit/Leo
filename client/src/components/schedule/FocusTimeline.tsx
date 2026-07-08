import { useAtom, useAtomValue } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import { activeDayAtom, lessonsAtom, personalEventsAtom, weekStartAtom } from '../../atoms/schedule';
import { usePersonalEventGroupMap } from '../../hooks/usePersonalEventGroupMap';
import { useStudentMap } from '../../hooks/useStudentMap';
import { academicUnitsShort } from '../../utils/academicHour';
import { avatarHueStyle } from '../../utils/avatarStyle';
import { dayScheduleItems, visibleGridDays, weekDates, weekDayNames } from '../../utils/schedule';
import {
  fmtTime,
  lessonCardClass,
  lessonCardVars,
  LessonMetaLine,
  LessonNotesMark,
  LessonPayMark,
  TypeIcon,
} from './LessonChrome';
import {
  personalEventCardVars,
  personalEventListCardClass,
  PersonalEventGroupSwatch,
  PersonalNotesMark,
} from './PersonalEventChrome';
import { RecurrenceIcon } from '../RecurrenceFields';

export function FocusTimeline({
  onSelect,
  onSelectPersonal,
  onAddLesson,
}: {
  onSelect: (id: string) => void;
  onSelectPersonal: (id: string) => void;
  onAddLesson: (day: number) => void;
}) {
  const lessons = useAtomValue(lessonsAtom);
  const personalEvents = useAtomValue(personalEventsAtom);
  const [activeDay, setActiveDay] = useAtom(activeDayAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tutor = useAtomValue(tutorAtom);
  const studentMap = useStudentMap();
  const groupMap = usePersonalEventGroupMap();
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const outline = tutor?.personalEventOutline ?? 'tab';
  const { short: dayNames, full: daysFull } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);
  const visibleDays = visibleGridDays(weekStartsOn, tutor?.hiddenWeekdays ?? []);

  const dayItems = dayScheduleItems(lessons, personalEvents, activeDay);

  const dayCount = (day: number) =>
    lessons.filter((l) => l.day === day).length +
    personalEvents.filter((e) => e.day === day).length;

  return (
    <div className="ft">
      <div
        className="ft__strip"
        style={{ '--ft-cols': visibleDays.length } as React.CSSProperties}
      >
        {visibleDays.map((i) => {
          const count = dayCount(i);
          return (
            <button
              key={i}
              type="button"
              className={'ft__pill' + (i === activeDay ? ' is-active' : '')}
              onClick={() => setActiveDay(i)}
            >
              <span className="ft__pill-dow">{dayNames[i]}</span>
              <span className="ft__pill-date">{dates[i]}</span>
              {count > 0 ? (
                <span className="ft__pill-count">{count}</span>
              ) : (
                <span className="ft__pill-count ft__pill-count--empty">·</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="ft__head">
        <h3>
          {daysFull[activeDay]}, {dates[activeDay]}
        </h3>
        <span className="ft__sub">
          {dayItems.length ? `${dayItems.length} в расписании` : 'Свободный день'}
        </span>
      </div>

      {dayItems.length === 0 ? (
        <div className="ft__empty">
          <div className="ft__empty-art" aria-hidden="true" />
          <p>На этот день ничего не запланировано.</p>
          <button type="button" className="btn btn--soft" onClick={() => onAddLesson(activeDay)}>
            + Добавить урок
          </button>
        </div>
      ) : (
        <div className="ft__rail">
          {dayItems.map((item) => {
            if (item.kind === 'lesson') {
              const l = item.lesson;
              const stu = studentMap.get(l.studentId);
              if (!stu) return null;
              return (
                <div key={l.id} className="ft__row">
                  <div className="ft__axis">
                    <span className="ft__t">{fmtTime(l.start)}</span>
                    <span className="ft__dur">{academicUnitsShort(l.academicUnits)}</span>
                  </div>
                  <button
                    type="button"
                    className={'ft__card ' + lessonCardClass(l)}
                    style={lessonCardVars(stu)}
                    onClick={() => onSelect(l.id)}
                  >
                    <LessonPayMark lesson={l} />
                    <LessonNotesMark notes={l.notes} />
                    <span className="avatar" style={avatarHueStyle(stu.hue)}>
                      {stu.initials}
                    </span>
                    <span className="ft__card-main">
                      <span className="ft__card-head">
                        <span className="ft__card-name">{stu.name}</span>
                        <TypeIcon type={l.type} />
                      </span>
                      <span className="ft__card-sub">
                        {fmtTime(l.start)}–{fmtTime(l.start + l.dur)} ·{' '}
                        {academicUnitsShort(l.academicUnits)}
                      </span>
                      <LessonMetaLine lesson={l} />
                    </span>
                    <span className="ft__card-side">
                      {stu.meet ? (
                        <a
                          className="ft__join"
                          href={stu.meet.startsWith('http') ? stu.meet : `https://${stu.meet}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Join
                        </a>
                      ) : (
                        <span className="ft__join">Join</span>
                      )}
                    </span>
                  </button>
                </div>
              );
            }

            const event = item.event;
            const group = groupMap.get(event.groupId);
            const color = group?.color ?? '#64748b';
            return (
              <div key={event.id} className="ft__row">
                <div className="ft__axis">
                  <span className="ft__t">{fmtTime(event.start)}</span>
                  <span className="ft__dur">{event.durationMin} мин</span>
                </div>
                <button
                  type="button"
                  className={
                    'ft__card ' +
                    personalEventListCardClass(outline, {
                      recurring: Boolean(event.recurringPersonalScheduleId),
                      hasNotes: Boolean(event.notes?.trim()),
                    })
                  }
                  style={personalEventCardVars(color)}
                  onClick={() => onSelectPersonal(event.id)}
                >
                  {event.recurringPersonalScheduleId ? (
                    <RecurrenceIcon title="Повторяющееся событие" />
                  ) : null}
                  <PersonalNotesMark notes={event.notes} />
                  <PersonalEventGroupSwatch color={color} />
                  <span className="ft__card-main">
                    <span className="ft__card-head">
                      <span className="ft__card-name">{event.title}</span>
                    </span>
                    <span className="ft__card-sub">
                      {fmtTime(event.start)}–{fmtTime(event.start + event.dur)} · {event.durationMin}{' '}
                      мин
                      {group ? ` · ${group.name}` : ''}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
