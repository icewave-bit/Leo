import { useEffect, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { tutorAtom } from '../atoms/auth';
import {
  activeDayAtom,
  lessonDraftAtom,
  lessonsAtom,
  scheduleVariantAtom,
  selectedLessonIdAtom,
  weekStartAtom,
} from '../atoms/schedule';
import { AddLessonDrawer } from '../components/AddLessonDrawer';
import { LessonDrawer } from '../components/LessonDrawer';
import { AgendaList } from '../components/schedule/AgendaList';
import { FocusTimeline } from '../components/schedule/FocusTimeline';
import { WeekGrid } from '../components/schedule/WeekGrid';
import { Wallet } from '../components/Wallet';
import { useLessonActions } from '../hooks/useLessonActions';
import { useStudent } from '../hooks/useStudentMap';
import { fmtWeekLabel } from '../utils/format';
import { isLessonPast } from '../utils/lessonBalance';
import { shiftWeek, todayDayIndex, weekRangeUtc, type ViewLesson } from '../utils/schedule';
import { loadSchedule } from '../state/loadSchedule';
import { useAppStore } from '../hooks/useAppStore';

type ShellContext = {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  mobile: boolean;
};

const VARIANTS = [
  { id: 'week' as const, label: 'Неделя' },
  { id: 'timeline' as const, label: 'Таймлайн' },
  { id: 'agenda' as const, label: 'Агенда' },
];

function Topbar({
  variant,
  setVariant,
  theme,
  setTheme,
  mobile,
  weekLabel,
  onPrevWeek,
  onNextWeek,
  onToday,
  onAddLesson,
}: {
  variant: 'week' | 'timeline' | 'agenda';
  setVariant: (v: 'week' | 'timeline' | 'agenda') => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  mobile: boolean;
  weekLabel: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddLesson: () => void;
}) {
  return (
    <header className="top">
      <div className="top__l">
        <h1 className="top__title">Расписание</h1>
        {!mobile && (
          <div className="weeknav">
            <button type="button" className="iconbtn" aria-label="Назад" onClick={onPrevWeek}>
              ‹
            </button>
            <span className="weeknav__label">{weekLabel}</span>
            <button type="button" className="iconbtn" aria-label="Вперёд" onClick={onNextWeek}>
              ›
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onToday}>
              Сегодня
            </button>
          </div>
        )}
      </div>
      <div className="top__r">
        <div className="seg seg--variant">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={'seg__btn' + (variant === v.id ? ' is-active' : '')}
              onClick={() => setVariant(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={onAddLesson}>
          + Урок
        </button>
        <button
          type="button"
          className="iconbtn iconbtn--round"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label="Тема"
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M21 13a8 8 0 11-9.5-9 6.5 6.5 0 009.5 9z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

function RightRail({
  lessons,
  onSelectStudent,
}: {
  lessons: ViewLesson[];
  onSelectStudent: (id: string) => void;
}) {
  const tutor = useAtomValue(tutorAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tz = tutor?.timezone ?? 'UTC';
  const today = todayDayIndex(weekStart, tz) ?? 0;

  const todayCount = lessons.filter((l) => l.day === today && l.status !== 'cancelled').length;
  const unpaid = lessons.filter((l) => l.status !== 'cancelled' && !l.paid).length;
  const hours = lessons
    .filter((l) => l.status !== 'cancelled')
    .reduce((a, l) => a + l.dur, 0);

  const featuredId = lessons.find((l) => !l.paid && l.status !== 'cancelled')?.studentId;
  const featured = useStudent(featuredId);

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
            <span className="stat__big" style={{ color: 'var(--c-debt)' }}>
              {unpaid}
            </span>
            <span className="stat__lbl">не оплачено</span>
          </div>
          <div className="stat stat--sm">
            <span className="stat__big">
              {hours.toFixed(1)}
              <span className="stat__unit">ч</span>
            </span>
            <span className="stat__lbl">на неделе</span>
          </div>
        </div>
      </div>

      {featured ? (
        <div className="rail__card">
          <div className="rail__card-head">
            <h4>Требует внимания</h4>
            <button type="button" className="link" onClick={() => onSelectStudent(featured.id)}>
              профиль
            </button>
          </div>
          <div
            className="rail__student"
            onClick={() => onSelectStudent(featured.id)}
            onKeyDown={(e) => e.key === 'Enter' && onSelectStudent(featured.id)}
            role="button"
            tabIndex={0}
          >
            <span
              className="avatar avatar--sm"
              style={{ background: `oklch(0.62 0.13 ${featured.hue})` }}
            >
              {featured.initials}
            </span>
            <span className="rail__student-txt">
              <strong>{featured.name}</strong>
              <span>есть неоплаченные уроки</span>
            </span>
          </div>
          <Wallet student={featured} compact />
        </div>
      ) : null}
    </aside>
  );
}

export function SchedulePage() {
  const { theme, setTheme, mobile } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const location = useLocation();
  const tutor = useAtomValue(tutorAtom);
  const lessons = useAtomValue(lessonsAtom);
  const [variant, setVariant] = useAtom(scheduleVariantAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const [selectedId, setSelectedId] = useAtom(selectedLessonIdAtom);
  const [draft, setDraft] = useAtom(lessonDraftAtom);
  const [prefillStudentId, setPrefillStudentId] = useState<string | undefined>();
  const setActiveDay = useSetAtom(activeDayAtom);
  const { setStatus, setPaid, createLesson, deleteLesson, rescheduleLesson } = useLessonActions();
  const store = useAppStore();

  const tz = tutor?.timezone ?? 'UTC';
  const weekLabel = fmtWeekLabel(weekStart, tz);
  const selected = selectedId ? lessons.find((l) => l.id === selectedId) : null;
  const effVariant = mobile && variant !== 'week' ? variant : variant;

  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';

  const reloadWeek = async (anchor: Date) => {
    const { weekStart } = weekRangeUtc(anchor, weekStartsOn);
    store.set(weekStartAtom, weekStart);
    await loadSchedule(store.get, store.set);
    const idx = todayDayIndex(weekStart, tz);
    if (idx != null) setActiveDay(idx);
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

  const openStudent = (sid: string) => {
    navigate(`/students/${sid}`);
  };

  const openCreate = (day: number, start = 10) => {
    setSelectedId(null);
    setDraft({ day, start });
  };

  const onLessonCreated = async (input: Parameters<typeof createLesson>[0]): Promise<string> => {
    const id = await createLesson(input);
    setDraft(null);
    setSelectedId(id);
    return id;
  };

  return (
    <div className="page">
      <Topbar
        variant={variant}
        setVariant={setVariant}
        theme={theme}
        setTheme={setTheme}
        mobile={mobile}
        weekLabel={weekLabel}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        onToday={onToday}
        onAddLesson={() => openCreate(todayDayIndex(weekStart, tz) ?? 0, 10)}
      />
      <div className="app__content">
        <main className="board">
          {effVariant === 'week' && (
            <WeekGrid
              onSelect={setSelectedId}
              onSlotClick={openCreate}
              onReschedule={rescheduleLesson}
            />
          )}
          {effVariant === 'timeline' && (
            <FocusTimeline onSelect={setSelectedId} onAddLesson={(day) => openCreate(day, 10)} />
          )}
          {effVariant === 'agenda' && <AgendaList onSelect={setSelectedId} />}
        </main>
        {!mobile && <RightRail lessons={lessons} onSelectStudent={openStudent} />}
      </div>
      {draft && (
        <AddLessonDrawer
          draft={draft}
          defaultStudentId={prefillStudentId}
          onClose={() => {
            setDraft(null);
            setPrefillStudentId(undefined);
          }}
          onCreate={onLessonCreated}
        />
      )}
      {selected && !draft && (
        <LessonDrawer
          lesson={selected}
          onClose={() => setSelectedId(null)}
          onStatus={setStatus}
          onPaid={setPaid}
          onDelete={deleteLesson}
        />
      )}
    </div>
  );
}
