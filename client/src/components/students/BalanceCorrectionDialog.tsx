import { useAtomValue } from 'jotai';
import { useEffect, useId, useRef, useState } from 'react';
import { studentsAtom } from '../../atoms/schedule';
import { useStudentActions } from '../../hooks/useStudentActions';
import { findBillingPayer, isBillingDependent } from '../../utils/billingStudent';
import {
  formatBalanceNetInput,
  partsFromBalanceNet,
  roundMoney,
} from '../../utils/balanceConvert';
import { fmtBalanceAmount, fmtBalanceNet } from '../../utils/format';
import type { ViewStudent } from '../../utils/schedule';
import { storedWalletNet } from '../../utils/walletCanonical';
import { StudentBalance } from '../StudentBalance';
import { BillingPayerLink } from './BillingPayerLink';

export interface BalanceCorrectionDialogProps {
  student: ViewStudent;
  open: boolean;
  onClose: () => void;
  onCorrected?: () => void;
  onOpenStudent?: (studentId: string) => void;
}

function parseSignedNet(raw: string, kind: ViewStudent['balanceKind']): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed === '+' ||
    trimmed === '.' ||
    trimmed === '-.'
  ) {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return kind === 'lessons' ? Math.round(n) : roundMoney(n);
}

export function BalanceCorrectionDialog({
  student,
  open,
  onClose,
  onCorrected,
  onOpenStudent,
}: BalanceCorrectionDialogProps) {
  const students = useAtomValue(studentsAtom);
  const { correctBalance } = useStudentActions();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving;

  const billingDependent = isBillingDependent(student);
  const billingPayer = billingDependent ? findBillingPayer(students, student) : undefined;
  const readonly = billingDependent;
  const kind = student.balanceKind;

  useEffect(() => {
    if (!open) return;
    setAmount(formatBalanceNetInput(student.prepaid, student.debt, student.balanceKind));
    setError(null);
    setSaving(false);
    if (!readonly) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, student.id, student.prepaid, student.debt, student.balanceKind, readonly]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const parsed = parseSignedNet(amount, kind);
  const currentNet = storedWalletNet(student.prepaid, student.debt, kind);
  const changed = parsed != null && parsed !== currentNet;
  const afterParts = parsed != null ? partsFromBalanceNet(parsed, kind) : null;

  const submit = async () => {
    if (readonly || parsed == null) return;
    if (!changed) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await correctBalance(student.id, parsed);
      onCorrected?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить баланс');
      setSaving(false);
    }
  };

  const openPayer = (payerId: string) => {
    onClose();
    onOpenStudent?.(payerId);
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
        className={'confirm replenish' + (readonly ? ' replenish--readonly' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="replenish__head">
          <h2 id={titleId} className="replenish__title">
            Корректировка
          </h2>
          <p className="replenish__student">{student.name}</p>
        </header>

        {readonly ? (
          <div className="replenish__balance">
            <p className="replenish__dependent-debt tnum">
              Долг за уроки:{' '}
              <strong>
                {student.openLessonDebt > 0
                  ? fmtBalanceAmount(
                      student.openLessonDebt,
                      billingPayer?.balanceKind ?? student.balanceKind,
                      billingPayer?.currency ?? student.currency,
                    )
                  : 'нет'}
              </strong>
            </p>
            <p className="replenish__hint">
              Личный баланс не ведётся — уроки списываются с общего счёта.
            </p>
          </div>
        ) : (
          <div className="replenish__balance">
            <StudentBalance student={student} compact />
          </div>
        )}

        {!readonly ? (
          <>
            <p className="replenish__hint">Отрицательное значение — долг.</p>
            <label className="field replenish__field">
              <span className="field__label">
                {kind === 'lessons' ? 'Баланс, уроков' : `Баланс, ${student.currency}`}
              </span>
              <input
                ref={inputRef}
                className="field__control replenish__input"
                type="number"
                step={kind === 'lessons' ? 1 : 0.01}
                inputMode={kind === 'lessons' ? 'numeric' : 'decimal'}
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

            {afterParts && changed ? (
              <p className="replenish__preview">
                Баланс:{' '}
                {fmtBalanceNet(student.prepaid, student.debt, kind, student.currency)}
                {' → '}
                <strong>
                  {fmtBalanceNet(
                    afterParts.prepaid,
                    afterParts.debt,
                    kind,
                    student.currency,
                  )}
                </strong>
              </p>
            ) : null}
          </>
        ) : null}

        {readonly && billingPayer && onOpenStudent ? (
          <BillingPayerLink
            payerId={billingPayer.id}
            payerName={billingPayer.name}
            onOpen={openPayer}
            className="replenish__payer-link"
          />
        ) : null}

        {error ? <p className="replenish__error">{error}</p> : null}

        <div className="confirm__actions replenish__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {readonly ? 'Закрыть' : 'Отмена'}
          </button>
          {!readonly ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void submit()}
              disabled={busy || parsed == null || !changed}
            >
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
