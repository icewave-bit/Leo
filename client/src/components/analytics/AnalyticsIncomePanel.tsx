import type { ReplenishmentIncomeBucket } from '../../utils/analytics';
import { lessonCountLabel } from '../../utils/format';

export interface AnalyticsIncomePanelProps {
  total: number;
  buckets: ReplenishmentIncomeBucket[];
}

export function AnalyticsIncomePanel({ total, buckets }: AnalyticsIncomePanelProps) {
  const rows = buckets.filter((b) => b.lessons > 0);

  return (
    <section className="analytics-panel">
      <header className="analytics-panel__head">
        <p className="analytics-panel__title">Доход</p>
        <p className="analytics-panel__sub">Пополнения в пересчёте на уроки</p>
      </header>

      {total <= 0 ? (
        <p className="analytics-panel__empty">Нет пополнений за период</p>
      ) : (
        <>
          <dl className="analytics-finance__grid analytics-income__total">
            <div className="analytics-finance__item">
              <dt>За период</dt>
              <dd className="tnum analytics-finance__val analytics-finance__val--credit">
                {lessonCountLabel(total)}
              </dd>
            </div>
          </dl>

          {rows.length > 0 ? (
            <ul className="analytics-income-list">
              {rows.map((b) => (
                <li key={b.key} className="analytics-income-list__row">
                  <span className="analytics-income-list__lbl">{b.label}</span>
                  <span className="analytics-income-list__val tnum">
                    {lessonCountLabel(b.lessons)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
