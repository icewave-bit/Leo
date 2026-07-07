import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { fmtTime } from '../utils/format';
import { formatRecurrenceSummary } from '../utils/recurrence';
import {
  visibleGridDays,
  weekDates,
  weekDayNames,
  type ViewPersonalEvent,
} from '../utils/schedule';
import {
  personalEventGroupsAtom,
  recurringPersonalSchedulesAtom,
  weekStartAtom,
} from '../atoms/schedule';
import { tutorAtom } from '../atoms/auth';
import { ConfirmDialog } from './ConfirmDialog';
import {
  LessonDeleteScopeOptions,
  type LessonDeleteScope,
} from './LessonDeleteScopeOptions';
import { RecurrenceIcon } from './RecurrenceFields';
import { personalEventCardVars } from './schedule/PersonalEventChrome';

function hoursToTimeValue(h: number): string {
  const hour = Math.floor(h);
  const minute = Math.round((h - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeValueToHours(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h + (m || 0) / 60;
}

interface PersonalEventDrawerProps {
  event: ViewPersonalEvent;
  onClose: () => void;
  onSave: (patch: {
    groupId: string;
    title: string;
    day: number;
    start: number;
    durationMin: number;
    notes: string | null;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDeleteSeries?: (scheduleId: string, fromEventId: string) => Promise<void>;
}

export function PersonalEventDrawer({
  event,
  onClose,
  onSave,
  onDelete,
  onDeleteSeries,
}: PersonalEventDrawerProps) {
  const groups = useAtomValue(personalEventGroupsAtom);
  const recurring = useAtomValue(recurringPersonalSchedulesAtom);
  const tutor = useAtomValue(tutorAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const { full: daysFull, short: daysShort } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);
  const visibleDays = visibleGridDays(weekStartsOn, tutor?.hiddenWeekdays ?? []);

  const group = groups.find((g) => g.id === event.groupId);
  const series = event.recurringPersonalScheduleId
    ? recurring.find((s) => s.id === event.recurringPersonalScheduleId)
    : null;

  const [title, setTitle] = useState(event.title);
  const [groupId, setGroupId] = useState(event.groupId);
  const [day, setDay] = useState(event.day);
  const [time, setTime] = useState(hoursToTimeValue(event.start));
  const [durationMin, setDurationMin] = useState(event.durationMin);
  const [notes, setNotes] = useState(event.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState<LessonDeleteScope>('lesson');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(event.title);
    setGroupId(event.groupId);
    setDay(event.day);
    setTime(hoursToTimeValue(event.start));
    setDurationMin(event.durationMin);
    setNotes(event.notes ?? '');
  }, [event.id, event.title, event.groupId, event.day, event.start, event.durationMin, event.notes]);

  const isRecurring = Boolean(event.recurringPersonalScheduleId && onDeleteSeries);
  const deleteSeries = isRecurring && deleteScope === 'series';

  const recurrenceSummary =
    series && group
      ? formatRecurrenceSummary(
          {
            intervalWeeks: series.intervalWeeks,
            weekdays: series.weekdays,
            endDate: series.endDate,
          },
          daysShort,
          fmtTime(series.startMinutes / 60),
        )
      : null;

  const save = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Введите название');
      return;
    }
    if (!groupId) {
      setError('Выберите группу');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        groupId,
        title: trimmedTitle,
        day,
        start: timeValueToHours(time),
        durationMin,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      if (deleteSeries && event.recurringPersonalScheduleId && onDeleteSeries) {
        await onDeleteSeries(event.recurringPersonalScheduleId, event.id);
      } else {
        await onDelete(event.id);
      }
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
      setDeleting(false);
    }
  };

  const selectedGroup = groups.find((g) => g.id === groupId) ?? group;

  return (
    <>
      <div className="scrim" onClick={onClose} role="presentation" />
      <aside className="drawer" role="dialog" aria-label="Личное событие">
        <header
          className="drawer__head drawer__head--pe"
          style={personalEventCardVars(selectedGroup?.color ?? '#64748b')}
        >
          <div className="drawer__head-txt">
            <h3>{event.title}</h3>
            <span className="drawer__sub">
              {daysFull[event.day]}, {dates[event.day]} · {fmtTime(event.start)}–
              {fmtTime(event.start + event.dur)}
            </span>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <form
          className="drawer__form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {event.recurringPersonalScheduleId ? (
            <p className="drawer__meta">
              <RecurrenceIcon title="Повторяющееся событие" />
              {recurrenceSummary}
            </p>
          ) : null}

          <label className="field">
            <span className="field__label">Название</span>
            <input
              className="field__control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={80}
            />
          </label>

          <label className="field">
            <span className="field__label">Группа</span>
            <select
              className="field__control"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              required
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">День</span>
            <select
              className="field__control"
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            >
              {visibleDays.map((i) => (
                <option key={i} value={i}>
                  {daysFull[i]}, {dates[i]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Время</span>
            <input
              className="field__control"
              type="time"
              value={time}
              step={900}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Длительность (мин)</span>
            <input
              className="field__control"
              type="number"
              min={15}
              max={480}
              step={15}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Информация</span>
            <textarea
              className="field__control field__control--area"
              value={notes}
              rows={5}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Заметки о событии…"
            />
          </label>

          {error ? <p className="drawer__error">{error}</p> : null}

          <div className="drawer__actions">
            <button
              type="button"
              className="btn btn--danger btn--ghost"
              onClick={() => setConfirmOpen(true)}
              disabled={saving}
            >
              Удалить
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
              Отмена
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        title={deleteSeries ? 'Удалить серию событий?' : 'Удалить событие?'}
        description={
          deleteSeries
            ? 'Будут удалены это и все последующие события в серии.'
            : 'Событие исчезнет из расписания.'
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
      >
        {isRecurring ? (
          <LessonDeleteScopeOptions
            scope={deleteScope}
            onScopeChange={setDeleteScope}
          />
        ) : null}
      </ConfirmDialog>
    </>
  );
}
