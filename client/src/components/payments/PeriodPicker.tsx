import { useAtom } from 'jotai';
import {
  paymentsCustomFromAtom,
  paymentsCustomToAtom,
  paymentsPeriodAtom,
  type PaymentsPeriod,
} from '../../atoms/payments';
import { defaultCustomPeriod } from '../../utils/paymentJournal';

const PRESETS: { id: PaymentsPeriod; label: string }[] = [
  { id: 'week', label: '7 дней' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: '3 мес' },
  { id: 'all', label: 'Всё' },
  { id: 'custom', label: 'Свой' },
];

export interface PeriodPickerProps {
  timezone: string;
}

export function PeriodPicker({ timezone }: PeriodPickerProps) {
  const [period, setPeriod] = useAtom(paymentsPeriodAtom);
  const [customFrom, setCustomFrom] = useAtom(paymentsCustomFromAtom);
  const [customTo, setCustomTo] = useAtom(paymentsCustomToAtom);

  const selectPeriod = (id: PaymentsPeriod) => {
    setPeriod(id);
    if (id === 'custom' && (!customFrom || !customTo)) {
      const d = defaultCustomPeriod(timezone);
      setCustomFrom(d.from);
      setCustomTo(d.to);
    }
  };

  return (
    <div className="period-picker">
      <div className="seg seg--period" role="group" aria-label="Период">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={'seg__btn' + (period === p.id ? ' is-active' : '')}
            onClick={() => selectPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' ? (
        <div className="period-picker__custom">
          <label className="period-picker__date">
            <span className="period-picker__date-lbl">С</span>
            <input
              className="field__control period-picker__input"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <span className="period-picker__dash">—</span>
          <label className="period-picker__date">
            <span className="period-picker__date-lbl">По</span>
            <input
              className="field__control period-picker__input"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
