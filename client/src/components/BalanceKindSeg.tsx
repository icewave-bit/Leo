import type { BalanceKind } from '../api/types';

const OPTIONS: { id: BalanceKind; label: string }[] = [
  { id: 'money', label: 'Деньги' },
  { id: 'lessons', label: 'Уроки' },
];

export function BalanceKindSeg({
  value,
  onChange,
  disabled,
}: {
  value: BalanceKind;
  onChange: (kind: BalanceKind) => void;
  disabled?: boolean;
}) {
  return (
    <div className="seg seg--balance-kind" role="group" aria-label="Тип баланса">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={'seg__btn' + (value === opt.id ? ' is-active' : '')}
          disabled={disabled}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
