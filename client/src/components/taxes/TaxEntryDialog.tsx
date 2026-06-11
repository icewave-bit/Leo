import { useEffect, useId, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { api } from '../../api/client';
import { tutorAtom } from '../../atoms/auth';
import { fmtDateKey, parseDateKey, todayDateKey } from '../../utils/dateKey';
import { CURRENCIES, type AppCurrency } from '../../utils/currencies';
import type { ViewStudent } from '../../utils/schedule';
import { StudentPicker } from '../payments/StudentPicker';

export interface TaxEntryDialogProps {
  open: boolean;
  students: ViewStudent[];
  defaultStudentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}

function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function TaxEntryDialog({
  open,
  students,
  defaultStudentId,
  onClose,
  onCreated,
}: TaxEntryDialogProps) {
  const tutor = useAtomValue(tutorAtom);
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const titleId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState<string | null>(defaultStudentId);
  const [receivedOn, setReceivedOn] = useState(() =>
    fmtDateKey(todayDateKey(), weekStartsOn),
  );
  const [currency, setCurrency] = useState<AppCurrency>('EUR');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStudent = studentId
    ? (students.find((s) => s.id === studentId) ?? null)
    : null;

  useEffect(() => {
    if (!open) return;
    setStudentId(defaultStudentId ?? students[0]?.id ?? null);
    setReceivedOn(fmtDateKey(todayDateKey(), weekStartsOn));
    setAmount('');
    setError(null);
    setSaving(false);
    window.setTimeout(() => amountRef.current?.focus(), 0);
  }, [open, defaultStudentId, students, weekStartsOn]);

  useEffect(() => {
    if (selectedStudent) setCurrency(selectedStudent.currency as AppCurrency);
  }, [selectedStudent?.id, selectedStudent?.currency]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  const submit = async () => {
    if (!studentId) {
      setError('Выберите ученика');
      return;
    }
    const parsedDate = parseDateKey(receivedOn, weekStartsOn);
    if (!parsedDate) {
      setError('Укажите дату в формате календаря');
      return;
    }
    const parsedAmount = parseAmount(amount);
    if (parsedAmount == null) {
      setError('Укажите сумму больше нуля');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.createTaxReplenishment({
        studentId,
        receivedOn: parsedDate,
        currency,
        amount: parsedAmount,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить запись');
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
      <div className="confirm replenish replenish--tax" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="replenish__head">
          <h2 id={titleId} className="replenish__title">
            Добавить запись
          </h2>
          <p className="replenish__hint">Только для налогового журнала — баланс ученика не меняется.</p>
        </header>

        <div className="tax-entry__fields">
          <div className="field">
            <span className="field__label">Ученик</span>
            <StudentPicker
              students={students}
              value={studentId}
              onChange={setStudentId}
              allowAll={false}
            />
          </div>

          <label className="field">
            <span className="field__label">Дата поступления</span>
            <input
              className="field__control tnum"
              type="text"
              inputMode="numeric"
              value={receivedOn}
              disabled={saving}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </label>

          <div className="tax-entry__row">
            <label className="field tax-entry__currency">
              <span className="field__label">Валюта</span>
              <select
                className="field__control"
                value={currency}
                disabled={saving}
                onChange={(e) => setCurrency(e.target.value as AppCurrency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="field tax-entry__amount">
              <span className="field__label">Сумма пополнения</span>
              <input
                ref={amountRef}
                className="field__control replenish__input tnum"
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                disabled={saving}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
              />
            </label>
          </div>
        </div>

        {error ? <p className="replenish__error" role="alert">{error}</p> : null}

        <div className="confirm__actions replenish__actions">
          <button type="button" className="btn btn--ghost" disabled={saving} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? 'Сохранение…' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  );
}
