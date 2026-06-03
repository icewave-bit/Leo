import { useState } from 'react';
import { useAtomValue } from 'jotai';
import type { RecurringSchedule } from '../api/types';
import { tutorAtom } from '../atoms/auth';
import { studentsAtom } from '../atoms/schedule';
import { useRecurringScheduleActions } from '../hooks/useRecurringScheduleActions';
import { academicUnitsShort } from '../utils/academicHour';
import {
  formatScheduleWhen,
  formatWeekdaysShort,
  minutesToTimeLabel,
} from '../utils/recurrence';
import { weekDayNames } from '../utils/schedule';
import { ConfirmDialog } from './ConfirmDialog';

interface RecurringSchedulesDrawerProps {
  schedules: RecurringSchedule[];
  onClose: () => void;
}

export function RecurringSchedulesDrawer({ schedules, onClose }: RecurringSchedulesDrawerProps) {
  const students = useAtomValue(studentsAtom);
  const tutor = useAtomValue(tutorAtom);
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const { short: daysShort } = weekDayNames(weekStartsOn);
  const { pauseRecurringSchedule, resumeRecurringSchedule, deleteRecurringSchedule } =
    useRecurringScheduleActions();

  const [pendingDelete, setPendingDelete] = useState<RecurringSchedule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  };

  const active = schedules.filter((s) => s.active);
  const paused = schedules.filter((s) => !s.active);

  const renderRow = (schedule: RecurringSchedule) => {
    const student = students.find((s) => s.id === schedule.studentId);
    const timeLabel = minutesToTimeLabel(schedule.startMinutes);
    const when = formatScheduleWhen(
      formatWeekdaysShort(schedule.weekdays, daysShort),
      timeLabel,
      academicUnitsShort(schedule.academicUnits),
    );

    return (
      <article key={schedule.id} className={'recur-row' + (schedule.active ? '' : ' recur-row--paused')}>
        <div className="recur-row__main">
          <span
            className="avatar avatar--sm"
            style={{ background: student ? `oklch(0.62 0.13 ${student.hue})` : undefined }}
          >
            {student?.initials ?? '?'}
          </span>
          <div className="recur-row__txt">
            <strong>{student?.name ?? 'Ученик'}</strong>
            <span>{when}</span>
            <span className="recur-row__meta">
              {schedule.active ? 'Активна' : 'На паузе'}
              {schedule.intervalWeeks === 2 ? ' · раз в две недели' : ''}
              {schedule.endDate ? ` · до ${schedule.endDate}` : ''}
            </span>
          </div>
        </div>
        <div className="recur-row__actions">
          {schedule.active ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busyId === schedule.id}
              onClick={() => void run(schedule.id, () => pauseRecurringSchedule(schedule.id))}
            >
              Пауза
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busyId === schedule.id}
              onClick={() => void run(schedule.id, () => resumeRecurringSchedule(schedule.id))}
            >
              Возобновить
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--danger"
            disabled={busyId === schedule.id}
            onClick={() => setPendingDelete(schedule)}
          >
            Удалить
          </button>
        </div>
      </article>
    );
  };

  return (
    <>
      <ConfirmDialog
        open={pendingDelete != null}
        title="Удалить серию?"
        description="Шаблон повторения будет удалён. Будущие запланированные уроки серии тоже будут удалены."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        loading={busyId != null}
        onConfirm={() => {
          if (!pendingDelete) return;
          void run(pendingDelete.id, async () => {
            await deleteRecurringSchedule(pendingDelete.id, true);
            setPendingDelete(null);
          });
        }}
        onCancel={() => {
          if (!busyId) setPendingDelete(null);
        }}
      />
      <div className="scrim" onClick={onClose} role="presentation" />
      <aside className="drawer" role="dialog" aria-label="Повторяющиеся уроки">
        <header className="drawer__head">
          <div className="drawer__head-txt">
            <h3>Повторяющиеся уроки</h3>
            <span className="drawer__sub">Автоматическое заполнение расписания</span>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        {schedules.length === 0 ? (
          <p className="drawer__hint">
            Пока нет повторяющихся уроков. При создании урока включите «Повторять еженедельно».
          </p>
        ) : (
          <div className="recur-list">
            {active.length > 0 ? (
              <section>
                <h4 className="recur-list__title">Активные ({active.length})</h4>
                {active.map(renderRow)}
              </section>
            ) : null}
            {paused.length > 0 ? (
              <section>
                <h4 className="recur-list__title">На паузе ({paused.length})</h4>
                {paused.map(renderRow)}
              </section>
            ) : null}
          </div>
        )}

        {error ? <p className="drawer__error">{error}</p> : null}

        <div className="drawer__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </aside>
    </>
  );
}
