import { useLayoutEffect, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import { lessonsAtom, studentsAtom, weekStartAtom } from '../../atoms/schedule';
import { ConfirmDialog } from '../ConfirmDialog';
import { LessonBalanceConfirmOptions } from '../LessonBalanceConfirmOptions';
import { findBillingPayer } from '../../utils/billingStudent';
import {
  WG_DAY_HOURS,
  WG_DEFAULT_VIEW_START,
  WG_GUTTER,
  WG_GUTTER_MOBILE,
  WG_HOUR_LABEL_INSET,
  WG_MOBILE_VISIBLE_HOURS,
} from '../../constants/weekGrid';
import { useWeekGridDrag } from '../../hooks/useWeekGridDrag';
import { useWeekGridPxPerHour } from '../../hooks/useWeekGridPxPerHour';
import { useStudentMap } from '../../hooks/useStudentMap';
import {
  visibleGridDays,
  weekDates,
  weekDayNames,
  todayDayIndex,
  type ViewLesson,
  type ViewStudent,
} from '../../utils/schedule';
import {
  layoutDayLessons,
  weekGridLessonLayoutClass,
  weekGridLessonPositionStyle,
  type WeekGridLessonLayout,
} from '../../utils/weekGridLayout';
import {
  fmtTime,
  lessonCardClass,
  lessonCardVars,
  lessonEventLabel,
  hasLessonNotes,
  lessonGridHint,
  LessonCardRotatingLabel,
  lessonNameClass,
  LessonNotesMark,
  LessonPayMark,
  LessonRecurrenceMark,
  TypeIcon,
} from './LessonChrome';

function LessonEvent({
  lesson,
  student,
  start,
  layout,
  ghost,
  compact,
  pxPerHour,
  onPointerDown,
  onClick,
}: {
  lesson: ViewLesson;
  student: ViewStudent;
  start: number;
  layout?: WeekGridLessonLayout;
  ghost?: boolean;
  compact?: boolean;
  pxPerHour: number;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
}) {
  const top = start * pxPerHour;
  const height = lesson.dur * pxPerHour - 4;
  const tight = height < pxPerHour * 0.72;
  const hint = lessonGridHint(lesson);
  const colsClass = weekGridLessonLayoutClass(layout);

  return (
    <button
      type="button"
      className={
        lessonCardClass(lesson, { tight, ghost }) +
        (hasLessonNotes(lesson.notes) ? ' ev--has-notes' : '') +
        (lesson.recurringScheduleId ? ' ev--has-recur' : '') +
        (colsClass ? ` ${colsClass}` : '')
      }
      style={{
        top,
        height,
        ...lessonCardVars(student),
        ...weekGridLessonPositionStyle(layout),
      }}
      title={
        `${student.name} · ${lessonEventLabel(lesson)}` +
        (hasLessonNotes(lesson.notes) ? ` · ${lesson.notes!.trim()}` : '')
      }
      aria-label={`${student.name}, ${fmtTime(start)}, ${lessonEventLabel(lesson)}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <LessonPayMark lesson={lesson} />
      <LessonRecurrenceMark recurring={Boolean(lesson.recurringScheduleId)} />
      <LessonNotesMark notes={lesson.notes} />
      {compact ? (
        <LessonCardRotatingLabel
          name={student.name}
          time={
            fmtTime(start) + (!tight ? ` – ${fmtTime(start + lesson.dur)}` : '')
          }
          groupIcon={lesson.type === 'group' ? <TypeIcon type="group" /> : null}
        />
      ) : (
        <>
          <span className="ev__head">
            <span className={lessonNameClass(student.name)}>{student.name}</span>
            {lesson.type === 'group' ? <TypeIcon type="group" /> : null}
          </span>
          <span className="ev__time">
            {fmtTime(start)}
            {!tight ? ` – ${fmtTime(start + lesson.dur)}` : null}
          </span>
        </>
      )}
      {hint && !tight ? <span className="ev__hint">{hint}</span> : null}
    </button>
  );
}

export function WeekGrid({
  compact = false,
  onSelect,
  onSlotClick,
  onReschedule,
}: {
  compact?: boolean;
  onSelect: (id: string) => void;
  onSlotClick: (day: number, startHour: number) => void;
  onReschedule: (id: string, day: number, start: number) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lessons = useAtomValue(lessonsAtom);
  const students = useAtomValue(studentsAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tutor = useAtomValue(tutorAtom);
  const studentMap = useStudentMap();
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const { short: dayNames, full: dayNamesFull } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);
  const todayIdx = todayDayIndex(weekStart, tz);
  const hiddenWeekdays = tutor?.hiddenWeekdays ?? [];
  const visibleDays = useMemo(
    () => visibleGridDays(weekStartsOn, hiddenWeekdays),
    [weekStartsOn, hiddenWeekdays],
  );
  const pxPerHour = useWeekGridPxPerHour(
    scrollRef,
    compact ? WG_MOBILE_VISIBLE_HOURS : null,
  );
  const gutter = compact ? WG_GUTTER_MOBILE : WG_GUTTER;

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
    pxPerHour,
    gutter,
    visibleDays,
    onSelect,
    onReschedule,
  });

  const hours = Array.from({ length: WG_DAY_HOURS }, (_, h) => h);
  const colH = WG_DAY_HOURS * pxPerHour;

  const layoutByDay = useMemo(() => {
    const byDay = new Map<number, Map<string, WeekGridLessonLayout>>();
    for (const di of visibleDays) {
      const dayLessons = lessons.filter((l) => l.day === di);
      const ghost =
        dragLesson && preview?.day === di
          ? { ...dragLesson, day: di, start: preview.start }
          : null;
      const forLayout = ghost
        ? [
            ...dayLessons.filter((l) => l.id !== dragLesson?.id),
            ghost,
          ]
        : dayLessons;
      byDay.set(di, layoutDayLessons(forLayout));
    }
    return byDay;
  }, [lessons, dragLesson, preview, visibleDays]);

  const weekMs = weekStart.getTime();
  const scrollWeekRef = useRef(weekMs);
  const scrollPxRef = useRef(pxPerHour);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (scrollWeekRef.current !== weekMs) {
      scrollWeekRef.current = weekMs;
      el.scrollTop = WG_HOUR_LABEL_INSET + WG_DEFAULT_VIEW_START * pxPerHour;
      scrollPxRef.current = pxPerHour;
      return;
    }

    if (scrollPxRef.current !== pxPerHour && scrollPxRef.current > 0) {
      const hourAtTop = (el.scrollTop - WG_HOUR_LABEL_INSET) / scrollPxRef.current;
      el.scrollTop = WG_HOUR_LABEL_INSET + hourAtTop * pxPerHour;
      scrollPxRef.current = pxPerHour;
    }
  }, [weekMs, pxPerHour]);

  const pendingWallet = pendingStudent
    ? findBillingPayer(students, pendingStudent) ?? pendingStudent
    : null;

  return (
    <div
      className={'wg' + (active ? ' wg--dragging' : '') + (compact ? ' wg--compact' : '')}
      style={{ '--wg-cols': visibleDays.length } as React.CSSProperties}
    >
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
        {needsBalanceConfirm && pending && pendingStudent && pendingWallet ? (
          <LessonBalanceConfirmOptions
            walletBalanceKind={pendingWallet.balanceKind}
            walletRate={pendingWallet.rate}
            lessonRate={pendingStudent.rate}
            academicUnits={pending.lesson.academicUnits}
            currency={pendingWallet.currency}
            balanceCharged={pending.lesson.balanceCharged}
            restoreBalance={restoreBalance}
            onRestoreBalanceChange={setRestoreBalance}
          />
        ) : null}
      </ConfirmDialog>

      <div className="wg__head">
        <div className="wg__gutter" />
        {visibleDays.map((di) => (
          <div key={di} className={'wg__day' + (di === todayIdx ? ' is-today' : '')}>
            <span className="wg__dow">{dayNames[di]}</span>
            <span className="wg__date">{dates[di]}</span>
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
              <div key={h} className="wg__hour" style={{ height: pxPerHour }}>
                <span>{compact ? String(h) : fmtTime(h)}</span>
              </div>
            ))}
          </div>
          {visibleDays.map((di) => (
            <div key={di} className={'wg__col' + (di === todayIdx ? ' is-today' : '')}>
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="wg__slot"
                  style={{ height: pxPerHour }}
                  aria-label={`Добавить урок ${fmtTime(h)}, ${dayNames[di]!}`}
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
                  const layout = layoutByDay.get(di)?.get(l.id);
                  return (
                    <LessonEvent
                      key={l.id}
                      lesson={l}
                      student={stu}
                      start={l.start}
                      layout={layout}
                      compact={compact}
                      pxPerHour={pxPerHour}
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
                  const layout = layoutByDay.get(di)?.get(dragLesson.id);
                  return (
                    <LessonEvent
                      key={`${dragLesson.id}-ghost`}
                      lesson={dragLesson}
                      student={stu}
                      start={preview.start}
                      layout={layout}
                      compact={compact}
                      pxPerHour={pxPerHour}
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
