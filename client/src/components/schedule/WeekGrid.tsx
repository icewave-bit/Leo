import { useLayoutEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import { lessonsAtom, weekStartAtom } from '../../atoms/schedule';
import { ConfirmDialog } from '../ConfirmDialog';
import { LessonBalanceConfirmOptions } from '../LessonBalanceConfirmOptions';
import {
  WG_DAY_HOURS,
  WG_DEFAULT_VIEW_START,
  WG_HOUR_LABEL_INSET,
  WG_PX_PER_HOUR,
} from '../../constants/weekGrid';
import { useWeekGridDrag } from '../../hooks/useWeekGridDrag';
import { useStudentMap } from '../../hooks/useStudentMap';
import {
  weekDates,
  weekDayNames,
  todayDayIndex,
  type ViewLesson,
  type ViewStudent,
} from '../../utils/schedule';
import {
  fmtTime,
  lessonCardClass,
  lessonCardVars,
  lessonEventLabel,
  lessonGridHint,
  LessonPayMark,
  TypeIcon,
} from './LessonChrome';
import { RecurrenceIcon } from '../RecurrenceFields';

function LessonEvent({
  lesson,
  student,
  start,
  ghost,
  onPointerDown,
  onClick,
}: {
  lesson: ViewLesson;
  student: ViewStudent;
  start: number;
  ghost?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
}) {
  const top = start * WG_PX_PER_HOUR;
  const height = lesson.dur * WG_PX_PER_HOUR - 4;
  const tight = height < 42;
  const hint = lessonGridHint(lesson);

  return (
    <button
      type="button"
      className={lessonCardClass(lesson, { tight, ghost })}
      style={{ top, height, ...lessonCardVars(student) }}
      title={`${student.name} · ${lessonEventLabel(lesson)}`}
      aria-label={`${student.name}, ${fmtTime(start)}, ${lessonEventLabel(lesson)}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <LessonPayMark lesson={lesson} />
      <span className="ev__head">
        <span className="ev__name">{student.name}</span>
        {lesson.recurringScheduleId ? <RecurrenceIcon /> : null}
        {lesson.type === 'group' ? <TypeIcon type="group" /> : null}
      </span>
      <span className="ev__time">
        {fmtTime(start)}
        {!tight ? ` – ${fmtTime(start + lesson.dur)}` : null}
      </span>
      {hint && !tight ? <span className="ev__hint">{hint}</span> : null}
    </button>
  );
}

export function WeekGrid({
  onSelect,
  onSlotClick,
  onReschedule,
}: {
  onSelect: (id: string) => void;
  onSlotClick: (day: number, startHour: number) => void;
  onReschedule: (id: string, day: number, start: number) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lessons = useAtomValue(lessonsAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tutor = useAtomValue(tutorAtom);
  const studentMap = useStudentMap();
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const { short: dayNames, full: dayNamesFull } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);
  const todayIdx = todayDayIndex(weekStart, tz);

  const {
    active,
    dragLesson,
    preview,
    pending,
    rescheduling,
    rescheduleDescription,
    pendingStudent,
    needsBalanceConfirm,
    restoreBalance,
    setRestoreBalance,
    onPointerDown,
    onLessonClick,
    confirmReschedule,
    cancelReschedule,
  } = useWeekGridDrag({
    scrollRef,
    bodyRef,
    dates,
    studentName: (id) => studentMap.get(id)?.name,
    getStudent: (id) => studentMap.get(id),
    daysFull: dayNamesFull,
    onSelect,
    onReschedule,
  });

  const hours = Array.from({ length: WG_DAY_HOURS }, (_, h) => h);
  const colH = WG_DAY_HOURS * WG_PX_PER_HOUR;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = WG_HOUR_LABEL_INSET + WG_DEFAULT_VIEW_START * WG_PX_PER_HOUR;
  }, [weekStart]);

  return (
    <div className={'wg' + (active ? ' wg--dragging' : '')}>
      <ConfirmDialog
        open={pending != null}
        title="Перенести урок?"
        description={rescheduleDescription}
        confirmLabel="Перенести"
        cancelLabel="Отмена"
        variant="default"
        loading={rescheduling}
        onConfirm={() => void confirmReschedule()}
        onCancel={cancelReschedule}
      >
        {needsBalanceConfirm && pending && pendingStudent ? (
          <LessonBalanceConfirmOptions
            balanceKind={pendingStudent.balanceKind}
            academicUnits={pending.lesson.academicUnits}
            rate={pendingStudent.rate}
            currency={pendingStudent.currency}
            balanceCharged={pending.lesson.balanceCharged}
            restoreBalance={restoreBalance}
            onRestoreBalanceChange={setRestoreBalance}
          />
        ) : null}
      </ConfirmDialog>

      <div className="wg__head">
        <div className="wg__gutter" />
        {dayNames.map((d, i) => (
          <div key={d} className={'wg__day' + (i === todayIdx ? ' is-today' : '')}>
            <span className="wg__dow">{d}</span>
            <span className="wg__date">{dates[i]}</span>
          </div>
        ))}
      </div>
      <div className="wg__scroll" ref={scrollRef}>
        <div
          ref={bodyRef}
          className="wg__body"
          style={{
            height: colH,
            paddingTop: WG_HOUR_LABEL_INSET,
            boxSizing: 'content-box',
          }}
        >
          <div className="wg__gutter wg__gutter--rows">
            {hours.map((h) => (
              <div key={h} className="wg__hour" style={{ height: WG_PX_PER_HOUR }}>
                <span>{fmtTime(h)}</span>
              </div>
            ))}
          </div>
          {dayNames.map((_, di) => (
            <div key={di} className={'wg__col' + (di === todayIdx ? ' is-today' : '')}>
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="wg__slot"
                  style={{ height: WG_PX_PER_HOUR }}
                  aria-label={`Добавить урок ${fmtTime(h)}, ${dayNames[di]}`}
                  onClick={() => !active && onSlotClick(di, h)}
                  tabIndex={active ? -1 : 0}
                />
              ))}
              {lessons
                .filter((l) => l.day === di)
                .map((l) => {
                  const stu = studentMap.get(l.studentId);
                  if (!stu) return null;
                  const isDragging = dragLesson?.id === l.id;
                  if (isDragging) return null;
                  return (
                    <LessonEvent
                      key={l.id}
                      lesson={l}
                      student={stu}
                      start={l.start}
                      onPointerDown={(e) => onPointerDown(e, l)}
                      onClick={() => onLessonClick(l.id)}
                    />
                  );
                })}
              {dragLesson &&
                preview &&
                preview.day === di &&
                (() => {
                  const stu = studentMap.get(dragLesson.studentId);
                  if (!stu) return null;
                  return (
                    <LessonEvent
                      key={`${dragLesson.id}-ghost`}
                      lesson={dragLesson}
                      student={stu}
                      start={preview.start}
                      ghost
                    />
                  );
                })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
