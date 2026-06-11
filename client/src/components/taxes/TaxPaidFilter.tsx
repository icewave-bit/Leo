import { useAtom } from 'jotai';
import { taxesPaidFilterAtom, type TaxesPaidFilter } from '../../atoms/taxes';

const OPTIONS: { id: TaxesPaidFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'paid', label: 'Уплачен' },
  { id: 'unpaid', label: 'Не уплачен' },
];

export function TaxPaidFilter() {
  const [filter, setFilter] = useAtom(taxesPaidFilterAtom);

  return (
    <div className="seg seg--tax-paid" role="group" aria-label="Фильтр по оплате налога">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={'seg__btn' + (filter === o.id ? ' is-active' : '')}
          onClick={() => setFilter(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
