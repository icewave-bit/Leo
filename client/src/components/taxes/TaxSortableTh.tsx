import type { TaxesSort, TaxSortKey } from '../../utils/taxJournalSort';

export function TaxSortableTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
  title,
}: {
  label: string;
  sortKey: TaxSortKey;
  sort: TaxesSort;
  onSort: (key: TaxSortKey) => void;
  className?: string;
  title?: string;
}) {
  const active = sort.key === sortKey;

  return (
    <th
      className={className}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={'tax-journal-table__sort' + (active ? ' is-active' : '')}
        title={title ?? label}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {active ? (
          <span className="tax-journal-table__sort-icon" aria-hidden="true">
            {sort.dir === 'asc' ? '↑' : '↓'}
          </span>
        ) : null}
      </button>
    </th>
  );
}
