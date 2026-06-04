import type { CurrencyFinance } from '../../utils/analytics';
import { fmtFinanceAmount } from '../../utils/analytics';

export interface AnalyticsFinancePanelProps {
  rows: CurrencyFinance[];
}

export function AnalyticsFinancePanel({ rows }: AnalyticsFinancePanelProps) {
  return (
    <section className="analytics-panel">
      <header className="analytics-panel__head">
        <p className="analytics-panel__title">Финансы</p>
        <p className="analytics-panel__sub">
          В деньгах; баланс в уроках конвертируется по ставке
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="analytics-panel__empty">Нет денежных операций за период</p>
      ) : (
        <ul className="analytics-finance">
          {rows.map((row) => (
            <li key={row.currency} className="analytics-finance__card">
              <div className="analytics-finance__head">
                <span className="analytics-finance__cur">{row.currency}</span>
                <span className="analytics-finance__count">
                  {row.studentCount} уч.
                </span>
              </div>
              <dl className="analytics-finance__grid">
                <div className="analytics-finance__item">
                  <dt>Пополнения</dt>
                  <dd className="tnum analytics-finance__val analytics-finance__val--credit">
                    +{fmtFinanceAmount(row.replenishments, row.currency)}
                  </dd>
                </div>
                <div className="analytics-finance__item">
                  <dt>Списания</dt>
                  <dd className="tnum analytics-finance__val">
                    {fmtFinanceAmount(row.lessonCharges, row.currency)}
                  </dd>
                </div>
                <div className="analytics-finance__item">
                  <dt>Портфель</dt>
                  <dd
                    className={
                      'tnum analytics-finance__val' +
                      (row.netPortfolio >= 0
                        ? ' analytics-finance__val--credit'
                        : ' analytics-finance__val--debt')
                    }
                  >
                    {row.netPortfolio >= 0 ? '+' : '−'}
                    {fmtFinanceAmount(Math.abs(row.netPortfolio), row.currency)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
