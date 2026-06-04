import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { BalanceKind } from '../../api/types';
import { tutorAtom } from '../../atoms/auth';
import { studentsAtom } from '../../atoms/schedule';
import { useStudentActions } from '../../hooks/useStudentActions';
import { useAppStore } from '../../hooks/useAppStore';
import { fmtBalanceAmount, fmtBalanceNet, fmtMoney, lessonCountLabel } from '../../utils/format';
import { fmtDateKey, todayDateKey } from '../../utils/dateKey';
import { patchForBalanceKind } from '../../utils/studentBalanceKind';
import type { ViewStudent } from '../../utils/schedule';
import { BalanceKindSeg } from '../BalanceKindSeg';
import { StudentBalance } from '../StudentBalance';

const LESSON_PRESETS = [1, 4, 8, 12] as const;

export interface BalanceReplenishDialogProps {
  student: ViewStudent;
  open: boolean;
  onClose: () => void;
  onReplenished?: () => void;
}

function parseAmount(raw: string, balanceKind: ViewStudent['balanceKind']): number | null {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return balanceKind === 'lessons' ? Math.round(n) : Math.round(n * 100) / 100;
}

export function BalanceReplenishDialog({
  student,
  open,
  onClose,
  onReplenished,
}: BalanceReplenishDialogProps) {
  const tutor = useAtomValue(tutorAtom);
  const preferred = tutor?.defaultReplenishBalanceKind ?? 'money';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const store = useAppStore();
  const { replenishBalance, updateStudent } = useStudentActions();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const kindTouchedRef = useRef(false);
  const [amount, setAmount] = useState('');
  const [receivedOn, setReceivedOn] = useState(todayDateKey);
  const [dialogKind, setDialogKind] = useState<BalanceKind>(student.balanceKind);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving;

  const persistBalanceKind = useCallback(
    async (next: BalanceKind) => {
      const current =
        store.get(studentsAtom).find((s) => s.id === student.id) ?? student;
      const patch = patchForBalanceKind(current, next);
      if (!patch) return;
      await updateStudent(student.id, patch);
    },
    [student, store, updateStudent],
  );

  const focusInput = () => {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!open) return;
    kindTouchedRef.current = false;
    setAmount('');
    setReceivedOn(todayDateKey());
    setError(null);
    setSaving(false);
    setDialogKind(student.balanceKind);
    focusInput();
  }, [open, student.id, student.balanceKind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const kind = dialogKind;
  const add = parseAmount(amount, kind);
  const net = student.prepaid - student.debt;
  const afterNet = add != null ? net + add : null;
  const unitLabel = kind === 'lessons' ? 'уроков' : student.currency;
  const hasDebt = student.debt > 0;
  const kindDiffers = kind !== student.balanceKind;

  const onBalanceKindChange = (next: BalanceKind) => {
    if (next === kind || saving) return;
    kindTouchedRef.current = true;
    setDialogKind(next);
    setAmount('');
    setError(null);
  };

  const submit = async () => {
    if (add == null) {
      setError(
        kind === 'lessons'
          ? 'Укажите целое число уроков больше нуля'
          : 'Укажите сумму больше нуля',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const latest =
        store.get(studentsAtom).find((s) => s.id === student.id) ?? student;
      if (kindTouchedRef.current && kind !== latest.balanceKind) {
        await persistBalanceKind(kind);
      }
      await replenishBalance(student.id, add, kind, receivedOn);
      onReplenished?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось пополнить');
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="confirm-layer replenish-layer" role="presentation">
      <button
        type="button"
        className="confirm-layer__scrim"
        aria-label="Закрыть"
        disabled={busy}
        onClick={onClose}
      />
      <div
        className="confirm replenish"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="replenish__head">
          <h2 id={titleId} className="replenish__title">
            Пополнить баланс
          </h2>
          <p className="replenish__student">{student.name}</p>
        </header>

        <div className="replenish__balance">
          <StudentBalance student={student} compact />
        </div>

        <div className="replenish__kind">
          <BalanceKindSeg
            value={kind}
            disabled={busy}
            onChange={onBalanceKindChange}
          />
        </div>

        {kindDiffers ? (
          <p className="replenish__hint replenish__hint--warn">
            Пополнение в {kind === 'lessons' ? 'уроках' : student.currency}. При сохранении
            переключим учёт с{' '}
            {student.balanceKind === 'lessons' ? 'уроков' : student.currency}.
          </p>
        ) : preferred !== student.balanceKind ? (
          <p className="replenish__hint">
            Учёт у ученика в {student.balanceKind === 'lessons' ? 'уроках' : student.currency}.
            {preferred === 'lessons' ? ' Чтобы пополнить уроками' : ' Чтобы пополнить деньгами'}
            , выберите «{preferred === 'lessons' ? 'Уроки' : 'Деньги'}».
          </p>
        ) : null}

        <label className="field replenish__field">
          <span className="field__label">
            {kind === 'lessons' ? 'Добавить уроков' : `Сумма, ${student.currency}`}
          </span>
          <input
            ref={inputRef}
            className="field__control replenish__input"
            type="number"
            min={kind === 'lessons' ? 1 : 0.01}
            step={kind === 'lessons' ? 1 : 0.01}
            inputMode={kind === 'lessons' ? 'numeric' : 'decimal'}
            placeholder={kind === 'lessons' ? '5' : '100'}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={busy}
          />
        </label>

        {kind === 'lessons' ? (
          <div className="replenish__presets" role="group" aria-label="Быстрый выбор">
            {LESSON_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={'replenish__preset' + (amount === String(n) ? ' is-active' : '')}
                disabled={busy}
                onClick={() => {
                  setAmount(String(n));
                  setError(null);
                }}
              >
                {lessonCountLabel(n)}
              </button>
            ))}
          </div>
        ) : null}

        <details className="replenish__received">
          <summary className="replenish__received-summary">
            Дата поступления:{' '}
            <span className="tnum">{fmtDateKey(receivedOn, weekStartsOn)}</span>
          </summary>
          <label className="field replenish__received-field">
            <span className="field__label">Когда поступили средства</span>
            <input
              className="field__control"
              type="date"
              value={receivedOn}
              disabled={busy}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </label>
        </details>

        {afterNet != null && !kindDiffers ? (
          <p className="replenish__preview">
            Баланс: {fmtBalanceNet(student.prepaid, student.debt, kind, student.currency)}
            {' → '}
            <strong>
              {fmtBalanceNet(student.prepaid + add!, student.debt, kind, student.currency)}
            </strong>
            {student.rate != null && student.rate > 0 ? (
              <span className="replenish__preview-sub">
                {' '}
                (
                {kind === 'lessons' ? (
                  <>~{fmtMoney(afterNet! * student.rate, student.currency)}</>
                ) : (
                  <>~{lessonCountLabel(afterNet! / student.rate)}</>
                )}{' '}
                по ставке)
              </span>
            ) : null}
          </p>
        ) : null}

        {hasDebt ? (
          <p className="replenish__hint">
            При пополнении неоплаченные проведённые уроки закроются автоматически, если хватит{' '}
            {unitLabel}.
          </p>
        ) : null}

        {error ? <p className="replenish__error">{error}</p> : null}

        <div className="confirm__actions replenish__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={busy || add == null}
          >
            {busy ? 'Сохранение…' : `Пополнить${add != null ? ` +${fmtBalanceAmount(add, kind, student.currency)}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
