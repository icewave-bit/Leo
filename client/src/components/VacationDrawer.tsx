import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { Vacation } from '../api/types';
import { tutorAtom } from '../atoms/auth';
import { personalEventGroupsAtom } from '../atoms/schedule';
import { useVacationActions } from '../hooks/useVacationActions';
import { dateKeyInTz } from '../utils/dateKey';
import { ConfirmDialog } from './ConfirmDialog';
import { DrawerSpoiler } from './DrawerSpoiler';
import { Icon, VACATION_ICON } from './Icon';
import { vacationRangeText } from './VacationRange';

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export interface VacationDrawerProps {
  variant: 'student' | 'tutor';
  existing: Vacation | null;
  studentId?: string;
  studentName?: string;
  onClose: () => void;
}

export function VacationDrawer({
  variant,
  existing,
  studentId,
  studentName,
  onClose,
}: VacationDrawerProps) {
  const tutor = useAtomValue(tutorAtom);
  const groups = useAtomValue(personalEventGroupsAtom);
  const { createVacation, patchVacation, returnFromVacation } = useVacationActions();
  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const today = dateKeyInTz(new Date(), tz);

  const [startDate, setStartDate] = useState(existing?.startDate ?? today);
  const [endDate, setEndDate] = useState(existing?.endDate ?? today);
  const [groupIds, setGroupIds] = useState<string[]>(existing?.personalGroupIds ?? []);
  const [saving, setSaving] = useState<'save' | 'return' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState<{ startDate: string; endDate: string } | null>(null);
  const [editId] = useState(existing?.id ?? null);
  const isEdit = editId != null;
  const groupKey = (existing?.personalGroupIds ?? []).join(',');

  useEffect(() => {
    if (!existing) return;
    setStartDate(existing.startDate);
    setEndDate(existing.endDate);
    setGroupIds(existing.personalGroupIds);
  }, [existing?.id, existing?.startDate, existing?.endDate, groupKey]);

  const dirty = useMemo(() => {
    if (!isEdit || !existing) return true;
    return (
      startDate !== existing.startDate ||
      endDate !== existing.endDate ||
      (variant === 'tutor' && !sameIds(groupIds, existing.personalGroupIds))
    );
  }, [isEdit, existing, startDate, endDate, groupIds, variant]);

  const title = variant === 'tutor' ? '⛄ Снеговичок устал' : 'Отпуск ученика';
  const subtitle = isEdit
    ? vacationRangeText(
        existing?.startDate ?? startDate,
        existing?.endDate ?? endDate,
        weekStartsOn,
      )
    : variant === 'student'
      ? studentName
      : 'Уроки учеников и выбранные личные списки снимаются на период';
  const returnLabel = variant === 'tutor' ? 'Вернуться из отпуска' : 'Вернуть из отпуска';
  const returningLabel = variant === 'tutor' ? 'Возвращаюсь…' : 'Возврат…';

  const validate = (): string | null => {
    if (!startDate || !endDate) return 'Укажите даты отпуска';
    if (endDate < startDate) return 'Дата окончания должна быть не раньше начала';
    if (variant === 'student' && !isEdit && !studentId) return 'Ученик не выбран';
    return null;
  };

  const submit = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    if (isEdit && !dirty) return;
    setSaving('save');
    setError(null);
    try {
      if (isEdit && editId) {
        await patchVacation(editId, {
          startDate,
          endDate,
          personalGroupIds: variant === 'tutor' ? groupIds : undefined,
        });
      } else {
        await createVacation({
          studentId: variant === 'student' ? studentId : null,
          startDate,
          endDate,
          personalGroupIds: variant === 'tutor' ? groupIds : undefined,
        });
        setPlanned({ startDate, endDate });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить отпуск');
    } finally {
      setSaving(null);
    }
  };

  const onReturn = async () => {
    if (!editId) return;
    setSaving('return');
    setError(null);
    try {
      await returnFromVacation(editId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось вернуть из отпуска');
    } finally {
      setSaving(null);
    }
  };

  const busy = saving != null;

  if (planned) {
    return (
      <ConfirmDialog
        open
        variant="success"
        title="Отпуск запланирован"
        description={`${vacationRangeText(planned.startDate, planned.endDate, weekStartsOn)}. Уведомление в Telegram уйдёт через 5 минут.`}
        confirmLabel="Готово"
        cancelLabel={null}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  return (
    <>
      <div className="scrim scrim--over" onClick={onClose} role="presentation" />
      <aside className="drawer drawer--over" role="dialog" aria-label={title}>
        <header className="drawer__head">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon icon={VACATION_ICON} size={22} />
          </span>
          <div className="drawer__head-txt">
            <h3>{title}</h3>
            {subtitle ? <span className="drawer__sub">{subtitle}</span> : null}
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <form
          className="drawer__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="vacation-dates">
            <label className="field">
              <span className="field__label">С</span>
              <input
                className="field__control"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field__label">По</span>
              <input
                className="field__control"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </label>
          </div>

          {variant === 'tutor' ? (
            <DrawerSpoiler title="Личные списки" defaultOpen={groupIds.length > 0}>
              {groups.length === 0 ? (
                <p className="drawer-panel__hint">Нет личных списков.</p>
              ) : (
                <div className="vacation-groups">
                  {groups.map((group) => (
                    <label key={group.id} className="vacation-groups__check">
                      <input
                        type="checkbox"
                        checked={groupIds.includes(group.id)}
                        onChange={() => setGroupIds((ids) => toggleId(ids, group.id))}
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </DrawerSpoiler>
          ) : null}

          {error ? <p className="drawer__error">{error}</p> : null}

          {isEdit ? (
            <div className="drawer__actions drawer__actions--spread">
              <button
                type="submit"
                className="btn btn--ghost"
                disabled={busy || !dirty}
              >
                {saving === 'save' ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void onReturn()}
              >
                {saving === 'return' ? returningLabel : returnLabel}
              </button>
            </div>
          ) : (
            <div className="drawer__actions">
              <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {saving === 'save' ? 'Сохранение…' : 'Отправить в отпуск'}
              </button>
            </div>
          )}
        </form>
      </aside>
    </>
  );
}
