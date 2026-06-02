import type { BalanceKind } from '../api/types';

const OPTIONS: { id: BalanceKind; label: string }[] = [
  { id: 'money', label: 'Деньги' },
  { id: 'lessons', label: 'Уроки' },
];

export function BalanceKindSeg({
  value,
  onChange,
}: {
  value: BalanceKind;
  onChange: (kind: BalanceKind) => void;
}) {
  return (
    <div className="seg seg--balance-kind" role="group" aria-label="Тип баланса">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={'seg__btn' + (value === opt.id ? ' is-active' : '')}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
