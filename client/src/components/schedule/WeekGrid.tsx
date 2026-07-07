import { useLayoutEffect, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import {
  lessonsAtom,
  personalEventGroupsAtom,
  personalEventsAtom,
  scheduleSlotOverridesAtom,
  studentsAtom,
  weekStartAtom,
} from '../../atoms/schedule';
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
import { usePersonalEventGridDrag } from '../../hooks/usePersonalEventGridDrag';
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
  layoutDayTimedItems,
  weekGridLessonLayoutClass,
  weekGridLessonPositionStyle,
  type WeekGridLessonLayout,
} from '../../utils/weekGridLayout';
import {
  blockedRangesByGridDay,
  defaultBlockWindowFromTutor,
  isSlotOffHours,
} from '../../utils/scheduleBlocks';
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
import { PersonalEventCard } from './PersonalEventChrome';

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
          time={fmtTime(start)}
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
  onSelectPersonal,
  onSlotClick,
  onReschedule,
  onReschedulePersonal,
}: {
  compact?: boolean;
  onSelect: (id: string) => void;
  onSelectPersonal: (id: string) => void;
  onSlotClick: (day: number, startHour: number, anchorEl: HTMLElement) => void;
  onReschedule: (id: string, day: number, start: number) => Promise<void>;
  onReschedulePersonal: (id: string, day: number, start: number) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lessons = useAtomValue(lessonsAtom);
  const personalEvents = useAtomValue(personalEventsAtom);
  const slotOverrides = useAtomValue(scheduleSlotOverridesAtom);
  const personalGroups = useAtomValue(personalEventGroupsAtom);
  const students = useAtomValue(studentsAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tutor = useAtomValue(tutorAtom);
  const studentMap = useStudentMap();
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const groupMap = useMemo(
    () => new Map(personalGroups.map((g) => [g.id, g])),
    [personalGroups],
  );
  const blockWindow = useMemo(
    () => defaultBlockWindowFromTutor(tutor),
    [tutor?.defaultBlockStartMinutes, tutor?.defaultBlockEndMinutes],
  );
  const blockedByDay = useMemo(
    () =>
      blockedRangesByGridDay(
        weekStartsOn,
        slotOverrides,
        lessons,
        personalEvents,
        blockWindow,
      ),
    [weekStartsOn, slotOverrides, lessons, personalEvents, blockWindow],
  );
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

  const {
    active: peActive,
    dragEvent,
    preview: pePreview,
    pending: pePending,
    rescheduling: peRescheduling,
    rescheduleDescription: peRescheduleDescription,
    onPointerDown: onPersonalPointerDown,
    onEventClick,
    confirmReschedule: confirmPersonalReschedule,
    cancelReschedule: cancelPersonalReschedule,
  } = usePersonalEventGridDrag({
    scrollRef,
    bodyRef,
    dates,
    daysFull: dayNamesFull,
    pxPerHour,
    gutter,
    visibleDays,
    onSelect: onSelectPersonal,
    onReschedule: onReschedulePersonal,
  });

  const dragging = active || peActive;

  const hours = Array.from({ length: WG_DAY_HOURS }, (_, h) => h);
  const colH = WG_DAY_HOURS * pxPerHour;

  const layoutByDay = useMemo(() => {
    const byDay = new Map<number, Map<string, WeekGridLessonLayout>>();
    for (const di of visibleDays) {
      const dayLessons = lessons.filter((l) => l.day === di);
      const dayPersonal = personalEvents.filter((e) => e.day === di);
      const lessonGhost =
        dragLesson && preview?.day === di
          ? { ...dragLesson, day: di, start: preview.start }
          : null;
      const personalGhost =
        dragEvent && pePreview?.day === di
          ? { ...dragEvent, day: di, start: pePreview.start }
          : null;
      const lessonItems = lessonGhost
        ? [...dayLessons.filter((l) => l.id !== dragLesson?.id), lessonGhost]
        : dayLessons;
      const personalItems = personalGhost
        ? [...dayPersonal.filter((e) => e.id !== dragEvent?.id), personalGhost]
        : dayPersonal;
      const forLayout = [...lessonItems, ...personalItems];
      byDay.set(di, layoutDayTimedItems(forLayout));
    }
    return byDay;
  }, [lessons, personalEvents, dragLesson, preview, dragEvent, pePreview, visibleDays]);

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
      className={'wg' + (dragging ? ' wg--dragging' : '') + (compact ? ' wg--compact' : '')}
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

      <ConfirmDialog
        open={pePending != null}
        title="Перенести событие?"
        description={peRescheduleDescription}
        confirmLabel="Перенести"
        cancelLabel="Отмена"
        variant="default"
        loading={peRescheduling}
        onConfirm={() => void confirmPersonalReschedule()}
        onCancel={cancelPersonalReschedule}
      />

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
              {(blockedByDay.get(di) ?? []).map((range, i) => (
                <div
                  key={`off-${i}`}
                  className="wg__off-hours"
                  style={{
                    top: range.start * pxPerHour,
                    height: (range.end - range.start) * pxPerHour,
                  }}
                  aria-hidden="true"
                />
              ))}
              {hours.map((h) => {
                const offHours = isSlotOffHours(di, h, blockedByDay);
                return (
                  <button
                    key={h}
                    type="button"
                    className={'wg__slot' + (offHours ? ' wg__slot--off' : '')}
                    style={{ height: pxPerHour }}
                    aria-label={`Добавить ${fmtTime(h)}, ${dayNames[di]!}`}
                    onClick={(e) => !dragging && onSlotClick(di, h, e.currentTarget)}
                    tabIndex={dragging ? -1 : 0}
                  />
                );
              })}
              {personalEvents
                .filter((e) => e.day === di)
                .map((e) => {
                  if (dragEvent?.id === e.id) return null;
                  return (
                    <PersonalEventCard
                      key={e.id}
                      event={e}
                      group={groupMap.get(e.groupId)}
                      layout={layoutByDay.get(di)?.get(e.id)}
                      pxPerHour={pxPerHour}
                      onPointerDown={(ev) => onPersonalPointerDown(ev, e)}
                      onClick={() => onEventClick(e.id)}
                    />
                  );
                })}
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
              {dragEvent &&
                pePreview &&
                pePreview.day === di &&
                (() => {
                  const layout = layoutByDay.get(di)?.get(dragEvent.id);
                  return (
                    <PersonalEventCard
                      key={`${dragEvent.id}-ghost`}
                      event={dragEvent}
                      group={groupMap.get(dragEvent.groupId)}
                      start={pePreview.start}
                      layout={layout}
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
