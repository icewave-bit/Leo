import { useEffect, useId, useRef, useState } from 'react';
import type { ViewStudent } from '../../utils/schedule';
import { useStudentActions } from '../../hooks/useStudentActions';
import { fmtBalanceAmount, fmtBalanceNet, fmtMoney, lessonCountLabel } from '../../utils/format';
import { Wallet } from '../Wallet';

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
  const { replenishBalance } = useStudentActions();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setError(null);
    setSaving(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, student.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  const add = parseAmount(amount, student.balanceKind);
  const net = student.prepaid - student.debt;
  const afterNet = add != null ? net + add : null;
  const unitLabel = student.balanceKind === 'lessons' ? 'уроков' : student.currency;
  const hasDebt = student.debt > 0;

  const submit = async () => {
    if (add == null) {
      setError(
        student.balanceKind === 'lessons'
          ? 'Укажите целое число уроков больше нуля'
          : 'Укажите сумму больше нуля',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await replenishBalance(student.id, add);
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
        disabled={saving}
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

        <div className="replenish__wallet">
          <Wallet student={student} compact />
        </div>

        <label className="field replenish__field">
          <span className="field__label">
            {student.balanceKind === 'lessons' ? 'Добавить уроков' : `Сумма, ${student.currency}`}
          </span>
          <input
            ref={inputRef}
            className="field__control replenish__input"
            type="number"
            min={student.balanceKind === 'lessons' ? 1 : 0.01}
            step={student.balanceKind === 'lessons' ? 1 : 0.01}
            inputMode={student.balanceKind === 'lessons' ? 'numeric' : 'decimal'}
            placeholder={student.balanceKind === 'lessons' ? '5' : '100'}
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
            disabled={saving}
          />
        </label>

        {student.balanceKind === 'lessons' ? (
          <div className="replenish__presets" role="group" aria-label="Быстрый выбор">
            {LESSON_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={'replenish__preset' + (amount === String(n) ? ' is-active' : '')}
                disabled={saving}
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

        {afterNet != null ? (
          <p className="replenish__preview">
            Баланс: {fmtBalanceNet(student.prepaid, student.debt, student.balanceKind, student.currency)}
            {' → '}
            <strong>
              {fmtBalanceNet(
                student.prepaid + add!,
                student.debt,
                student.balanceKind,
                student.currency,
              )}
            </strong>
            {student.rate != null && student.rate > 0 ? (
              <span className="replenish__preview-sub">
                {' '}
                (
                {student.balanceKind === 'lessons' ? (
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
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={saving || add == null}
          >
            {saving ? 'Сохранение…' : `Пополнить${add != null ? ` +${fmtBalanceAmount(add, student.balanceKind, student.currency)}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
