import { useAtom, useAtomValue } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import { activeDayAtom, lessonsAtom, weekStartAtom } from '../../atoms/schedule';
import { weekDates, weekDayNames } from '../../utils/schedule';
import { useStudentMap } from '../../hooks/useStudentMap';
import { academicUnitsShort } from '../../utils/academicHour';
import {
  fmtTime,
  lessonCardClass,
  lessonCardVars,
  LessonMetaLine,
  TypeIcon,
} from './LessonChrome';

export function FocusTimeline({
  onSelect,
  onAddLesson,
}: {
  onSelect: (id: string) => void;
  onAddLesson: (day: number) => void;
}) {
  const lessons = useAtomValue(lessonsAtom);
  const [activeDay, setActiveDay] = useAtom(activeDayAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tutor = useAtomValue(tutorAtom);
  const studentMap = useStudentMap();
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const { short: dayNames, full: daysFull } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);

  const dayLessons = lessons
    .filter((l) => l.day === activeDay)
    .sort((a, b) => a.start - b.start);

  return (
    <div className="ft">
      <div className="ft__strip">
        {dayNames.map((d, i) => {
          const count = lessons.filter((l) => l.day === i).length;
          return (
            <button
              key={d}
              type="button"
              className={'ft__pill' + (i === activeDay ? ' is-active' : '')}
              onClick={() => setActiveDay(i)}
            >
              <span className="ft__pill-dow">{d}</span>
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
          {dayLessons.length ? `${dayLessons.length} занятий` : 'Свободный день'}
        </span>
      </div>

      {dayLessons.length === 0 ? (
        <div className="ft__empty">
          <div className="ft__empty-art" aria-hidden="true" />
          <p>На этот день уроков нет.</p>
          <button type="button" className="btn btn--soft" onClick={() => onAddLesson(activeDay)}>
            + Добавить урок
          </button>
        </div>
      ) : (
        <div className="ft__rail">
          {dayLessons.map((l) => {
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
                  <span className="avatar" style={{ background: `oklch(0.62 0.13 ${stu.hue})` }}>
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
          })}
        </div>
      )}
    </div>
  );
}
