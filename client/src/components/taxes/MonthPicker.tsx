import { useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import type { PrimitiveAtom } from 'jotai';
import { taxesMonthAtom } from '../../atoms/taxes';
import {
  MONTHS_SHORT_RU,
  monthLabel,
  parseMonthKey,
  shiftMonthKey,
  toMonthKey,
} from '../../utils/taxMonth';

export interface MonthPickerProps {
  monthAtom?: PrimitiveAtom<string>;
}

export function MonthPicker({ monthAtom = taxesMonthAtom }: MonthPickerProps) {
  const [month, setMonth] = useAtom(monthAtom);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseMonthKey(month).year);
  const rootRef = useRef<HTMLDivElement>(null);

  const { year: selectedYear, month: selectedMonth } = parseMonthKey(month);

  useEffect(() => {
    if (open) setViewYear(selectedYear);
  }, [open, selectedYear]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!month) return null;

  const pickMonth = (m: number) => {
    setMonth(toMonthKey(viewYear, m));
    setOpen(false);
  };

  return (
    <div
      className={'month-picker' + (open ? ' month-picker--open' : '')}
      ref={rootRef}
    >
      <button
        type="button"
        className="month-picker__nav"
        aria-label="Предыдущий месяц"
        onClick={() => setMonth(shiftMonthKey(month, -1))}
      >
        ‹
      </button>

      <div className="month-picker__field">
        <button
          type="button"
          className="month-picker__label"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {monthLabel(month)}
        </button>

        {open ? (
          <div className="month-picker__panel" role="dialog" aria-label="Выбор месяца">
            <div className="month-picker__year">
              <button
                type="button"
                className="month-picker__year-nav"
                aria-label="Предыдущий год"
                onClick={() => setViewYear((y) => y - 1)}
              >
                ‹
              </button>
              <span className="month-picker__year-label tnum">{viewYear}</span>
              <button
                type="button"
                className="month-picker__year-nav"
                aria-label="Следующий год"
                onClick={() => setViewYear((y) => y + 1)}
              >
                ›
              </button>
            </div>

            <div className="month-picker__grid">
              {MONTHS_SHORT_RU.map((name, index) => {
                const m = index + 1;
                const active = viewYear === selectedYear && m === selectedMonth;
                return (
                  <button
                    key={name}
                    type="button"
                    className={'month-picker__month' + (active ? ' is-active' : '')}
                    aria-current={active ? 'date' : undefined}
                    onClick={() => pickMonth(m)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="month-picker__nav"
        aria-label="Следующий месяц"
        onClick={() => setMonth(shiftMonthKey(month, 1))}
      >
        ›
      </button>
    </div>
  );
}
