import type { StatusSlice } from '../../utils/analytics';

export interface AnalyticsStatusBreakdownProps {
  slices: StatusSlice[];
}

export function AnalyticsStatusBreakdown({ slices }: AnalyticsStatusBreakdownProps) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  return (
    <section className="analytics-panel">
      <header className="analytics-panel__head">
        <p className="analytics-panel__title">Статусы уроков</p>
        <p className="analytics-panel__sub">{total} всего</p>
      </header>

      {total === 0 ? (
        <p className="analytics-panel__empty">Нет уроков за период</p>
      ) : (
        <>
          <div
            className="analytics-stack"
            role="img"
            aria-label="Распределение по статусам"
          >
            {slices
              .filter((s) => s.count > 0)
              .map((s) => (
                <span
                  key={s.status}
                  className={'analytics-stack__seg analytics-stack__seg--' + s.tone}
                  style={{ flex: s.count }}
                  title={`${s.label}: ${s.count}`}
                />
              ))}
          </div>

          <ul className="analytics-legend">
            {slices.map((s) => (
              <li key={s.status} className="analytics-legend__item">
                <span className={'analytics-legend__dot analytics-legend__dot--' + s.tone} />
                <span className="analytics-legend__lbl">{s.label}</span>
                <span className="analytics-legend__val tnum">
                  {s.count}
                  <span className="analytics-legend__pct">{Math.round(s.pct)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
