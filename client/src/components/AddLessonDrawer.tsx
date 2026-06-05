import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { AcademicUnits, LessonType, RecurrenceConfig } from '../api/types';
import { tutorAtom } from '../atoms/auth';
import { studentsAtom, weekStartAtom } from '../atoms/schedule';
import { academicHourHint, durationMinFromUnits } from '../utils/academicHour';
import { resolveRecurrenceStartDate } from '../utils/recurrence';
import { weekDates, weekDayNames, type LessonDraft } from '../utils/schedule';
import { fmtTime } from '../utils/format';
import { AcademicUnitsSeg } from './AcademicUnitsSeg';
import { RecurrenceFields } from './RecurrenceFields';

function hoursToTimeValue(h: number): string {
  const hour = Math.floor(h);
  const minute = Math.round((h - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeValueToHours(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h + (m || 0) / 60;
}

export interface CreateLessonInput {
  studentId: string;
  day: number;
  start: number;
  academicUnits: AcademicUnits;
  type: LessonType;
  notes: string | null;
}

export interface CreateRecurringLessonInput extends CreateLessonInput {
  recurrence: RecurrenceConfig;
}

interface AddLessonDrawerProps {
  draft: LessonDraft;
  defaultStudentId?: string;
  onClose: () => void;
  onCreate: (input: CreateLessonInput) => Promise<string>;
  onCreateRecurring?: (input: CreateRecurringLessonInput) => Promise<void>;
}

export function AddLessonDrawer({
  draft,
  defaultStudentId,
  onClose,
  onCreate,
  onCreateRecurring,
}: AddLessonDrawerProps) {
  const students = useAtomValue(studentsAtom);
  const tutor = useAtomValue(tutorAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const tz = tutor?.timezone ?? 'UTC';
  const academicHourMin = tutor?.academicHourMin ?? 60;
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const { full: daysFull, short: daysShort } = weekDayNames(weekStartsOn);
  const dates = weekDates(weekStart, tz);

  const [day, setDay] = useState(draft.day);
  const [time, setTime] = useState(hoursToTimeValue(draft.start));
  const [studentId, setStudentId] = useState(
    defaultStudentId && students.some((s) => s.id === defaultStudentId)
      ? defaultStudentId
      : (students[0]?.id ?? ''),
  );

  useEffect(() => {
    if (defaultStudentId && students.some((s) => s.id === defaultStudentId)) {
      setStudentId(defaultStudentId);
    }
  }, [defaultStudentId, students]);

  const [academicUnits, setAcademicUnits] = useState<AcademicUnits>(1);
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
    if (!repeatEnabled) return;
    setRecurrence((prev) =>
      prev.weekdays.includes(day) ? prev : { ...prev, weekdays: toggleDay(prev.weekdays, day) },
    );
  }, [day, repeatEnabled]);

  const selected = students.find((s) => s.id === studentId);
  const lessonType: LessonType = selected?.group ? 'group' : 'solo';
  const durationMin = durationMinFromUnits(academicUnits, academicHourMin);
  const startHours = timeValueToHours(time);

  const whenLabel = useMemo(() => {
    if (repeatEnabled) {
      return `${fmtTime(startHours)} · ${durationMin} мин`;
    }
    const end = startHours + durationMin / 60;
    return `${daysFull[day]}, ${dates[day]} · ${fmtTime(startHours)}–${fmtTime(end)}`;
  }, [repeatEnabled, day, dates, daysFull, startHours, durationMin]);

  const submit = async () => {
    if (!studentId) {
      setError('Выберите ученика');
      return;
    }
    if (repeatEnabled && recurrence.weekdays.length === 0) {
      setError('Выберите хотя бы один день');
      return;
    }
    if (repeatEnabled && recurrence.endDate) {
      const startDate = resolveRecurrenceStartDate(weekStart, recurrence.weekdays, tz);
      if (recurrence.endDate < startDate) {
        setError('Дата окончания должна быть не раньше первого урока');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        studentId,
        day,
        start: startHours,
        academicUnits,
        type: lessonType,
        notes: notes.trim() || null,
      };
      if (repeatEnabled && onCreateRecurring) {
        await onCreateRecurring({ ...input, recurrence });
      } else {
        await onCreate(input);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать урок');
      setSaving(false);
    }
  };

  const submitLabel = repeatEnabled
    ? saving
      ? 'Создание серии…'
      : 'Создать серию'
    : saving
      ? 'Сохранение…'
      : 'Создать урок';

  return (
    <>
      <div className="scrim" onClick={onClose} role="presentation" />
      <aside className="drawer" role="dialog" aria-label="Новый урок">
        <header className="drawer__head">
          <div className="drawer__head-txt">
            <h3>{repeatEnabled ? 'Новая серия уроков' : 'Новый урок'}</h3>
            <span className="drawer__sub">{whenLabel}</span>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        {students.length === 0 ? (
          <p className="drawer__hint">Сначала добавьте ученика в разделе «Студенты».</p>
        ) : (
          <form
            className="drawer__form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {!repeatEnabled ? (
              <label className="field">
                <span className="field__label">День</span>
                <select
                  className="field__control"
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                >
                  {daysFull.map((name, i) => (
                    <option key={name} value={i}>
                      {name}, {dates[i]}
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

            <label className="field">
              <span className="field__label">Ученик</span>
              <select
                className="field__control"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.group ? ' (группа)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="field">
              <span className="field__label">Длительность</span>
              <AcademicUnitsSeg value={academicUnits} onChange={setAcademicUnits} />
              <span className="field__hint">{academicHourHint(academicHourMin)}</span>
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
              <span className="field__label">Напоминание (необязательно)</span>
              <textarea
                className="field__control field__control--area"
                value={notes}
                rows={3}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Напомнить себе перед уроком…"
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
