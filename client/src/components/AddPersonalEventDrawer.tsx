import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { RecurrenceConfig } from '../api/types';
import { tutorAtom } from '../atoms/auth';
import { personalEventGroupsAtom, weekStartAtom } from '../atoms/schedule';
import { resolveRecurrenceStartDate } from '../utils/recurrence';
import { visibleGridDays, weekDates, weekDayNames, type PersonalEventDraft } from '../utils/schedule';
import { fmtTime } from '../utils/format';
import { RecurrenceFields } from './RecurrenceFields';

const DURATION_PRESETS = [30, 45, 60, 90, 120] as const;

function hoursToTimeValue(h: number): string {
  const hour = Math.floor(h);
  const minute = Math.round((h - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeValueToHours(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h + (m || 0) / 60;
}

export interface CreatePersonalEventInput {
  groupId: string;
  title: string;
  day: number;
  start: number;
  durationMin: number;
  notes: string | null;
}

export interface CreateRecurringPersonalEventInput extends CreatePersonalEventInput {
  recurrence: RecurrenceConfig;
}

interface AddPersonalEventDrawerProps {
  draft: PersonalEventDraft;
  onClose: () => void;
  onCreate: (input: CreatePersonalEventInput) => Promise<string>;
  onCreateRecurring?: (input: CreateRecurringPersonalEventInput) => Promise<void>;
}

export function AddPersonalEventDrawer({
  draft,
  onClose,
  onCreate,
  onCreateRecurring,
}: AddPersonalEventDrawerProps) {
  const groups = useAtomValue(personalEventGroupsAtom);
  const tutor = useAtomValue(tutorAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const { full: daysFull, short: daysShort } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);
  const visibleDays = visibleGridDays(weekStartsOn, tutor?.hiddenWeekdays ?? []);

  const [day, setDay] = useState(() => {
    const visible = visibleGridDays(weekStartsOn, tutor?.hiddenWeekdays ?? []);
    return visible.includes(draft.day) ? draft.day : (visible[0] ?? draft.day);
  });
  const [time, setTime] = useState(hoursToTimeValue(draft.start));
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [durationMin, setDurationMin] = useState<number>(60);
  const [customDuration, setCustomDuration] = useState(false);
  const [notes, setNotes] = useState('');
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceConfig>({
    intervalWeeks: 1,
    weekdays: [draft.day],
    endDate: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groups.length > 0 && !groups.some((g) => g.id === groupId)) {
      setGroupId(groups[0]!.id);
    }
  }, [groups, groupId]);

  useEffect(() => {
    if (!repeatEnabled) return;
    setRecurrence((prev) =>
      prev.weekdays.includes(day) ? prev : { ...prev, weekdays: toggleDay(prev.weekdays, day) },
    );
  }, [day, repeatEnabled]);

  const startHours = timeValueToHours(time);

  const whenLabel = useMemo(() => {
    if (repeatEnabled) {
      return `${fmtTime(startHours)} · ${durationMin} мин`;
    }
    const end = startHours + durationMin / 60;
    return `${daysFull[day]}, ${dates[day]} · ${fmtTime(startHours)}–${fmtTime(end)}`;
  }, [repeatEnabled, day, dates, daysFull, startHours, durationMin]);

  const submit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Введите название');
      return;
    }
    if (!groupId) {
      setError('Выберите группу');
      return;
    }
    if (repeatEnabled && recurrence.weekdays.length === 0) {
      setError('Выберите хотя бы один день');
      return;
    }
    if (repeatEnabled && recurrence.endDate) {
      const startDate = resolveRecurrenceStartDate(weekStart, recurrence.weekdays, tz);
      if (recurrence.endDate < startDate) {
        setError('Дата окончания должна быть не раньше первого события');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        groupId,
        title: trimmedTitle,
        day,
        start: startHours,
        durationMin,
        notes: notes.trim() || null,
      };
      if (repeatEnabled && onCreateRecurring) {
        await onCreateRecurring({ ...input, recurrence });
      } else {
        await onCreate(input);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать событие');
      setSaving(false);
    }
  };

  const submitLabel = repeatEnabled
    ? saving
      ? 'Создание серии…'
      : 'Создать серию'
    : saving
      ? 'Сохранение…'
      : 'Создать';

  return (
    <>
      <div className="scrim" onClick={onClose} role="presentation" />
      <aside className="drawer" role="dialog" aria-label="Новое личное событие">
        <header className="drawer__head">
          <div className="drawer__head-txt">
            <h3>{repeatEnabled ? 'Новая серия событий' : 'Личное событие'}</h3>
            <span className="drawer__sub">{whenLabel}</span>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        {groups.length === 0 ? (
          <p className="drawer__hint">
            Сначала создайте группу в настройках («Группы личных событий»).
          </p>
        ) : (
          <form
            className="drawer__form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="field">
              <span className="field__label">Название</span>
              <input
                className="field__control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Спортзал, вторая работа…"
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

            {!repeatEnabled ? (
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
            ) : null}

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

            <div className="field">
              <span className="field__label">Длительность</span>
              <div className="seg">
                {DURATION_PRESETS.map((min) => (
                  <button
                    key={min}
                    type="button"
                    className={
                      'seg__btn' + (!customDuration && durationMin === min ? ' is-active' : '')
                    }
                    onClick={() => {
                      setCustomDuration(false);
                      setDurationMin(min);
                    }}
                  >
                    {min} м
                  </button>
                ))}
                <button
                  type="button"
                  className={'seg__btn' + (customDuration ? ' is-active' : '')}
                  onClick={() => setCustomDuration(true)}
                >
                  Другое
                </button>
              </div>
              {customDuration ? (
                <input
                  className="field__control"
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                />
              ) : null}
            </div>

            {onCreateRecurring ? (
              <RecurrenceFields
                enabled={repeatEnabled}
                onEnabledChange={setRepeatEnabled}
                config={recurrence}
                onConfigChange={setRecurrence}
                weekStartsOn={weekStartsOn}
                timeLabel={fmtTime(startHours)}
                dayLabels={daysShort}
                timezone={tz}
              />
            ) : null}

            <label className="field">
              <span className="field__label">Информация (необязательно)</span>
              <textarea
                className="field__control field__control--area"
                value={notes}
                rows={4}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Адрес, детали, ссылка…"
              />
            </label>

            {error ? <p className="drawer__error">{error}</p> : null}

            <div className="drawer__actions">
              <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {submitLabel}
              </button>
            </div>
          </form>
        )}
      </aside>
    </>
  );
}

function toggleDay(weekdays: number[], day: number): number[] {
  return [...new Set([...weekdays, day])].sort((a, b) => a - b);
}
