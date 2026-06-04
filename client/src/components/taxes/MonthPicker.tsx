import { useAtom } from 'jotai';
import type { PrimitiveAtom } from 'jotai';
import { taxesMonthAtom } from '../../atoms/taxes';
import { monthLabel, shiftMonthKey } from '../../utils/taxMonth';

export interface MonthPickerProps {
  monthAtom?: PrimitiveAtom<string>;
}

export function MonthPicker({ monthAtom = taxesMonthAtom }: MonthPickerProps) {
  const [month, setMonth] = useAtom(monthAtom);

  if (!month) return null;

  return (
    <div className="month-picker">
      <button
        type="button"
        className="month-picker__nav"
        aria-label="Предыдущий месяц"
        onClick={() => setMonth(shiftMonthKey(month, -1))}
      >
        ‹
      </button>
      <label className="month-picker__field">
        <span className="month-picker__sr">Месяц</span>
        <input
          className="field__control month-picker__input"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <span className="month-picker__label" aria-hidden>
          {monthLabel(month)}
        </span>
      </label>
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
