import { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { tutorAtom } from '../atoms/auth';
import {
  activeDayAtom,
  lessonDraftAtom,
  lessonsAtom,
  personalEventDraftAtom,
  personalEventsAtom,
  scheduleVariantAtom,
  selectedLessonIdAtom,
  selectedPersonalEventIdAtom,
  weekStartAtom,
  scheduleSlotOverridesAtom,
} from '../atoms/schedule';
import { AddLessonDrawer } from '../components/AddLessonDrawer';
import { AddPersonalEventDrawer } from '../components/AddPersonalEventDrawer';
import { LessonDrawer } from '../components/LessonDrawer';
import { PersonalEventDrawer } from '../components/PersonalEventDrawer';
import { SlotActionSheet } from '../components/schedule/SlotActionSheet';
import { AgendaList } from '../components/schedule/AgendaList';
import { FocusTimeline } from '../components/schedule/FocusTimeline';
import { WeekGrid } from '../components/schedule/WeekGrid';
import { useLessonActions } from '../hooks/useLessonActions';
import { usePersonalEventActions } from '../hooks/usePersonalEventActions';
import { useRecurringScheduleActions } from '../hooks/useRecurringScheduleActions';
import { useRecurringPersonalActions } from '../hooks/useRecurringPersonalActions';
import { useScheduleSlotActions } from '../hooks/useScheduleSlotActions';
import { fmtWeekLabel } from '../utils/format';
import { isLessonPast } from '../utils/lessonBalance';
import {
  clampGridDayToVisible,
  shiftWeek,
  todayDayIndex,
  weekRangeUtc,
  weekDayNames,
  type ViewLesson,
  type SlotSheetState,
  slotAnchorFromElement,
} from '../utils/schedule';
import {
  defaultBlockWindowFromTutor,
  hasEventInHour,
  isLessonSlotBlocked,
} from '../utils/scheduleBlocks';
import { fmtTime } from '../utils/format';
import { loadSchedule } from '../state/loadSchedule';
import { useAppStore } from '../hooks/useAppStore';
import type { ShellOutletContext } from '../components/AppShell';
import { Icon } from '../components/Icon';

const VARIANTS = [
  { id: 'week' as const, label: 'Неделя', mobileLabel: 'Неделя' },
  { id: 'timeline' as const, label: 'Таймлайн', mobileLabel: 'Лента' },
  { id: 'agenda' as const, label: 'Агенда', mobileLabel: 'Список' },
];

function Topbar({
  variant,
  setVariant,
  resolvedTheme,
  setTheme,
  mobile,
  weekLabel,
  onPrevWeek,
  onNextWeek,
  onToday,
  onAddLesson,
  weekNavBusy,
}: {
  variant: 'week' | 'timeline' | 'agenda';
  setVariant: (v: 'week' | 'timeline' | 'agenda') => void;
  resolvedTheme: ShellOutletContext['resolvedTheme'];
  setTheme: ShellOutletContext['setTheme'];
  mobile: boolean;
  weekLabel: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddLesson: () => void;
  weekNavBusy?: boolean;
}) {
  const themeBtn = (
    <button
      type="button"
      className="iconbtn iconbtn--round"
      onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
      aria-label="Тема"
    >
      {resolvedTheme === 'light' ? (
        <Icon icon="moon" size={18} />
      ) : (
        <Icon icon="sunny" size={18} />
      )}
    </button>
  );

  const weekNav = (
    <div className="weeknav">
      <div className="weeknav__range">
        <button
          type="button"
          className="iconbtn"
          aria-label="Назад"
          disabled={weekNavBusy}
          onClick={onPrevWeek}
        >
          ‹
        </button>
        <span className="weeknav__label">{weekLabel}</span>
        <button
          type="button"
          className="iconbtn"
          aria-label="Вперёд"
          disabled={weekNavBusy}
          onClick={onNextWeek}
        >
          ›
        </button>
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={weekNavBusy}
        onClick={onToday}
      >
        Сегодня
      </button>
    </div>
  );

  const variantSeg = (
    <div className="seg seg--variant">
      {VARIANTS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={'seg__btn' + (variant === v.id ? ' is-active' : '')}
          onClick={() => setVariant(v.id)}
        >
          {mobile ? v.mobileLabel : v.label}
        </button>
      ))}
    </div>
  );

  if (mobile) {
    return (
      <header className="top top--schedule">
        <div className="top__row top__row--toolbar">
          <div className="weeknav weeknav--compact">
            <button
              type="button"
              className="iconbtn iconbtn--dense"
              aria-label="Назад"
              disabled={weekNavBusy}
              onClick={onPrevWeek}
            >
              ‹
            </button>
            <span className="weeknav__label">{weekLabel}</span>
            <button
              type="button"
              className="iconbtn iconbtn--dense"
              aria-label="Вперёд"
              disabled={weekNavBusy}
              onClick={onNextWeek}
            >
              ›
            </button>
          </div>
          <div className="top__actions">
            <button type="button" className="top__link" disabled={weekNavBusy} onClick={onToday}>
              Сегодня
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm top__fab"
              onClick={onAddLesson}
              aria-label="Добавить урок"
            >
              +
            </button>
          </div>
        </div>
        {variantSeg}
      </header>
    );
  }

  return (
    <header className="top">
      <div className="top__l">
        <h1 className="top__title">Расписание</h1>
        {weekNav}
      </div>
      <div className="top__r">
        {variantSeg}
        <button type="button" className="btn btn--primary btn--sm" onClick={onAddLesson}>
          + Урок
        </button>
        {themeBtn}
      </div>
    </header>
  );
}

function RightRail({ lessons }: { lessons: ViewLesson[] }) {
  const tutor = useAtomValue(tutorAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tz = tutor?.timezone ?? 'UTC';
  const today = todayDayIndex(weekStart, tz) ?? 0;

  const todayCount = lessons.filter((l) => l.day === today && l.status !== 'cancelled').length;
  const completedCount = lessons.filter((l) => l.status === 'completed').length;
  const academicHours = lessons
    .filter((l) => l.status !== 'cancelled')
    .reduce((sum, l) => sum + l.academicUnits, 0);

  return (
    <aside className="rail">
      <div className="rail__card rail__stats">
        <h4>Сегодня</h4>
        <div className="stat">
          <span className="stat__big">{todayCount}</span>
          <span className="stat__lbl">занятий сегодня</span>
        </div>
        <div className="rail__split">
          <div className="stat stat--sm">
            <span className="stat__big">{completedCount}</span>
            <span className="stat__lbl">проведено</span>
          </div>
          <div className="stat stat--sm">
            <span className="stat__big">
              {academicHours}
              <span className="stat__unit">ч</span>
            </span>
            <span className="stat__lbl">на неделе</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function SchedulePage() {
  const { resolvedTheme, setTheme, mobile } = useOutletContext<ShellOutletContext>();
  const navigate = useNavigate();
  const location = useLocation();
  const tutor = useAtomValue(tutorAtom);
  const lessons = useAtomValue(lessonsAtom);
  const personalEvents = useAtomValue(personalEventsAtom);
  const slotOverrides = useAtomValue(scheduleSlotOverridesAtom);
  const [variant, setVariant] = useAtom(scheduleVariantAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const [selectedId, setSelectedId] = useAtom(selectedLessonIdAtom);
  const [selectedPersonalId, setSelectedPersonalId] = useAtom(selectedPersonalEventIdAtom);
  const [draft, setDraft] = useAtom(lessonDraftAtom);
  const [personalDraft, setPersonalDraft] = useAtom(personalEventDraftAtom);
  const [slotSheet, setSlotSheet] = useState<SlotSheetState | null>(null);
  const [prefillStudentId, setPrefillStudentId] = useState<string | undefined>();
  const [activeDay, setActiveDay] = useAtom(activeDayAtom);
  const [weekNavBusy, setWeekNavBusy] = useState(false);
  const { setStatus, setPaid, setNotes, createLesson, deleteLesson, rescheduleLesson } =
    useLessonActions();
  const { createRecurringSchedule, deleteRecurringSchedule } = useRecurringScheduleActions();
  const { createPersonalEvent, patchPersonalEvent, deletePersonalEvent } =
    usePersonalEventActions();
  const { createRecurringPersonalSchedule, deleteRecurringPersonalSchedule } =
    useRecurringPersonalActions();
  const { toggleSlotBlock } = useScheduleSlotActions();
  const [slotToggling, setSlotToggling] = useState(false);
  const store = useAppStore();

  const tz = tutor?.timezone ?? 'UTC';
  const weekLabel = fmtWeekLabel(weekStart, tz);
  const selected = selectedId ? lessons.find((l) => l.id === selectedId) : null;
  const selectedPersonal = selectedPersonalId
    ? personalEvents.find((e) => e.id === selectedPersonalId)
    : null;
  const effVariant = mobile && variant !== 'week' ? variant : variant;

  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const hiddenWeekdays = tutor?.hiddenWeekdays ?? [];
  const { full: daysFull } = weekDayNames(weekStartsOn);

  const blockWindow = defaultBlockWindowFromTutor(tutor);

  const slotSheetBlocked =
    slotSheet != null
      ? isLessonSlotBlocked(
          slotSheet.day,
          slotSheet.start,
          weekStartsOn,
          slotOverrides,
          lessons,
          personalEvents,
          blockWindow,
        )
      : false;

  const slotSheetHasEvent =
    slotSheet != null
      ? hasEventInHour(slotSheet.day, slotSheet.start, lessons, personalEvents)
      : false;

  useEffect(() => {
    const today = todayDayIndex(weekStart, tz);
    if (today != null) {
      setActiveDay(clampGridDayToVisible(today, weekStartsOn, hiddenWeekdays));
    }
  }, [weekStart, tz, weekStartsOn, hiddenWeekdays, setActiveDay]);

  useEffect(() => {
    const clamped = clampGridDayToVisible(activeDay, weekStartsOn, hiddenWeekdays);
    if (clamped !== activeDay) setActiveDay(clamped);
  }, [activeDay, weekStartsOn, hiddenWeekdays, setActiveDay]);

  const reloadWeek = async (anchor: Date) => {
    const { weekStart } = weekRangeUtc(anchor, weekStartsOn);
    setWeekNavBusy(true);
    try {
      await loadSchedule(store.get, store.set, { anchor: weekStart, lessonsOnly: true });
      const idx = todayDayIndex(weekStart, tz);
      if (idx != null) setActiveDay(clampGridDayToVisible(idx, weekStartsOn, hiddenWeekdays));
    } finally {
      setWeekNavBusy(false);
    }
  };

  const onPrevWeek = () => void reloadWeek(shiftWeek(weekStart, -1));
  const onNextWeek = () => void reloadWeek(shiftWeek(weekStart, 1));
  const onToday = () => void reloadWeek(new Date());

  useEffect(() => {
    const awaitingAuto =
      lessons.some(
        (l) => l.status === 'planned' && isLessonPast(l.startUtc, l.durationMin),
      );
    if (!awaitingAuto) return;
    const timer = window.setInterval(() => {
      void loadSchedule(store.get, store.set);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [lessons, store]);

  useEffect(() => {
    const sid = (location.state as { addLessonForStudent?: string } | null)?.addLessonForStudent;
    if (!sid) return;
    setPrefillStudentId(sid);
    setSelectedId(null);
    setDraft({ day: todayDayIndex(weekStart, tz) ?? 0, start: 10 });
    navigate('/schedule', { replace: true, state: {} });
  }, [location.state, navigate, setDraft, setSelectedId, weekStart, tz]);

  const openCreateLesson = (day: number, start = 10) => {
    setSelectedPersonalId(null);
    setSelectedId(null);
    setPersonalDraft(null);
    setDraft({
      day: clampGridDayToVisible(day, weekStartsOn, hiddenWeekdays),
      start,
    });
  };

  const openCreatePersonal = (day: number, start = 10) => {
    setSelectedPersonalId(null);
    setSelectedId(null);
    setDraft(null);
    setPersonalDraft({
      day: clampGridDayToVisible(day, weekStartsOn, hiddenWeekdays),
      start,
    });
  };

  const onSlotClick = (day: number, start: number, anchorEl: HTMLElement) => {
    setSlotSheet({ day, start, anchor: slotAnchorFromElement(anchorEl) });
  };

  const onLessonCreated = async (input: Parameters<typeof createLesson>[0]): Promise<string> => {
    const id = await createLesson(input);
    setDraft(null);
    setSelectedId(null);
    return id;
  };

  const onRecurringCreated = async (
    input: Parameters<typeof createRecurringSchedule>[0],
  ): Promise<void> => {
    await createRecurringSchedule(input);
    setDraft(null);
    setPrefillStudentId(undefined);
  };

  const onRecurringPersonalCreated = async (
    input: Parameters<typeof createRecurringPersonalSchedule>[0],
  ): Promise<void> => {
    await createRecurringPersonalSchedule(input);
    setPersonalDraft(null);
  };

  const reschedulePersonalEvent = async (id: string, day: number, start: number) => {
    await patchPersonalEvent(id, { day, start });
  };

  return (
    <div className="page">
      <Topbar
        variant={variant}
        setVariant={setVariant}
        resolvedTheme={resolvedTheme}
        setTheme={setTheme}
        mobile={mobile}
        weekLabel={weekLabel}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        onToday={onToday}
        onAddLesson={() => openCreateLesson(todayDayIndex(weekStart, tz) ?? 0, 10)}
        weekNavBusy={weekNavBusy}
      />
      <div className="app__content">
        <main className="board">
          {effVariant === 'week' && (
            <WeekGrid
              compact={mobile}
              onSelect={(id) => {
                setSelectedPersonalId(null);
                setSelectedId(id);
              }}
              onSelectPersonal={(id) => {
                setSelectedId(null);
                setSelectedPersonalId(id);
              }}
              onSlotClick={onSlotClick}
              onReschedule={rescheduleLesson}
              onReschedulePersonal={reschedulePersonalEvent}
            />
          )}
          {effVariant === 'timeline' && (
            <FocusTimeline
              onSelect={(id) => {
                setSelectedPersonalId(null);
                setSelectedId(id);
              }}
              onAddLesson={(day) => openCreateLesson(day, 10)}
            />
          )}
          {effVariant === 'agenda' && <AgendaList onSelect={setSelectedId} />}
        </main>
        {!mobile && <RightRail lessons={lessons} />}
      </div>
      {slotSheet ? (
        <SlotActionSheet
          dayLabel={daysFull[slotSheet.day]!}
          timeLabel={fmtTime(slotSheet.start)}
          blocked={slotSheetBlocked}
          lessonDisabled={slotSheetBlocked}
          toggling={slotToggling}
          anchored={!mobile}
          anchor={slotSheet.anchor}
          onLesson={() => {
            if (slotSheetBlocked) return;
            const { day, start } = slotSheet;
            setSlotSheet(null);
            openCreateLesson(day, start);
          }}
          onPersonal={() => {
            const { day, start } = slotSheet;
            setSlotSheet(null);
            openCreatePersonal(day, start);
          }}
          onToggleBlock={() => {
            if (!slotSheet) return;
            setSlotToggling(true);
            void toggleSlotBlock(
              slotSheet.day,
              slotSheet.start,
              weekStartsOn,
              slotSheetHasEvent,
            )
              .then(() => setSlotSheet(null))
              .finally(() => setSlotToggling(false));
          }}
          onClose={() => setSlotSheet(null)}
        />
      ) : null}
      {draft && (
        <AddLessonDrawer
          draft={draft}
          defaultStudentId={prefillStudentId}
          onClose={() => {
            setDraft(null);
            setPrefillStudentId(undefined);
          }}
          onCreate={onLessonCreated}
          onCreateRecurring={onRecurringCreated}
        />
      )}
      {personalDraft && (
        <AddPersonalEventDrawer
          draft={personalDraft}
          onClose={() => setPersonalDraft(null)}
          onCreate={async (input) => {
            const id = await createPersonalEvent(input);
            setPersonalDraft(null);
            setSelectedPersonalId(null);
            return id;
          }}
          onCreateRecurring={onRecurringPersonalCreated}
        />
      )}
      {selected && !draft && !personalDraft && (
        <LessonDrawer
          lesson={selected}
          onClose={() => setSelectedId(null)}
          onStatus={setStatus}
          onPaid={setPaid}
          onNotes={setNotes}
          onDelete={deleteLesson}
          onDeleteSeries={(scheduleId, fromLessonId) =>
            deleteRecurringSchedule(scheduleId, fromLessonId)
          }
        />
      )}
      {selectedPersonal && !draft && !personalDraft && (
        <PersonalEventDrawer
          event={selectedPersonal}
          onClose={() => setSelectedPersonalId(null)}
          onSave={async (patch) => {
            await patchPersonalEvent(selectedPersonal.id, patch);
          }}
          onDelete={deletePersonalEvent}
          onDeleteSeries={(scheduleId, fromEventId) =>
            deleteRecurringPersonalSchedule(scheduleId, fromEventId)
          }
        />
      )}
    </div>
  );
}
