export interface AnalyticsBarChartProps {
  title: string;
  subtitle?: string;
  items: Array<{ label: string; value: number; secondary?: string }>;
  valueLabel?: string;
  emptyLabel?: string;
  variant?: 'default' | 'income';
}

export function AnalyticsBarChart({
  title,
  subtitle,
  items,
  valueLabel = 'уроков',
  emptyLabel = 'Нет данных за период',
  variant = 'default',
}: AnalyticsBarChartProps) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <section className={'analytics-panel' + (variant === 'income' ? ' analytics-panel--income' : '')}>
      <header className="analytics-panel__head">
        <p className="analytics-panel__title">{title}</p>
        {subtitle ? <p className="analytics-panel__sub">{subtitle}</p> : null}
      </header>

      {items.length === 0 || items.every((i) => i.value === 0) ? (
        <p className="analytics-panel__empty">{emptyLabel}</p>
      ) : (
        <ul className="analytics-bars" aria-label={title}>
          {items.map((item) => (
            <li key={item.label} className="analytics-bars__row">
              <span className="analytics-bars__lbl">{item.label}</span>
              <div className="analytics-bars__track" aria-hidden>
                <span
                  className={
                    'analytics-bars__fill' +
                    (variant === 'income' ? ' analytics-bars__fill--income' : '')
                  }
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
              <span className="analytics-bars__val tnum">
                {item.value}
                {item.secondary ? (
                  <span className="analytics-bars__secondary">{item.secondary}</span>
                ) : (
                  <span className="analytics-bars__unit">{valueLabel}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
