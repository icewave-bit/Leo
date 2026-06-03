import { useAtomValue } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import { lessonsAtom, weekStartAtom } from '../../atoms/schedule';
import { weekDates, weekDayNames, todayDayIndex } from '../../utils/schedule';
import { useStudentMap } from '../../hooks/useStudentMap';
import {
  fmtTime,
  lessonCardClass,
  lessonCardVars,
  LessonMetaLine,
  LessonPayMark,
  TypeIcon,
} from './LessonChrome';

export function AgendaList({ onSelect }: { onSelect: (id: string) => void }) {
  const lessons = useAtomValue(lessonsAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tutor = useAtomValue(tutorAtom);
  const studentMap = useStudentMap();
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const { full: daysFull } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);
  const todayIdx = todayDayIndex(weekStart, tz);

  const byDay = Array.from({ length: 7 }, (_, i) =>
    lessons.filter((l) => l.day === i).sort((a, b) => a.start - b.start),
  );

  return (
    <div className="ag">
      {byDay.map((ls, di) =>
        ls.length === 0 ? null : (
          <section key={di} className="ag__group">
            <div className="ag__date">
              <span className={'ag__num' + (di === todayIdx ? ' is-today' : '')}>{dates[di]}</span>
              <span className="ag__dow">{daysFull[di]}</span>
              <span className="ag__line" />
              <span className="ag__count">{ls.length}</span>
            </div>
            <div className="ag__cards">
              {ls.map((l) => {
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
                    <span className="ag__time">
                      <strong>{fmtTime(l.start)}</strong>
                      <span>{fmtTime(l.start + l.dur)}</span>
                    </span>
                    <span
                      className="avatar avatar--sm"
                      style={{ background: `oklch(0.62 0.13 ${stu.hue})` }}
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
              })}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
