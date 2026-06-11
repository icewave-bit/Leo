import { fmtByn } from '../../utils/format';

export interface TaxSummaryData {
  totalByn: number;
  bynCount: number;
  totalTax: number;
  taxCount: number;
  taxPaidCount: number;
  count: number;
}

export function TaxSummaryStrip({
  summary,
  showByn,
  taxRatePercent,
  taxColLabel,
}: {
  summary: TaxSummaryData;
  showByn: boolean;
  taxRatePercent: number;
  taxColLabel: string;
}) {
  if (summary.count === 0) return null;

  return (
    <section className="tax-summary" aria-label="Итоги за месяц">
      <div className="tax-summary__stats">
        {showByn && summary.bynCount > 0 ? (
          <div className="tax-summary__stat">
            <span className="tax-summary__stat-lbl">Итого BYN</span>
            <span className="tax-summary__stat-val tnum">{fmtByn(summary.totalByn)}</span>
          </div>
        ) : null}
        {summary.taxCount > 0 && taxRatePercent > 0 ? (
          <div className="tax-summary__stat">
            <span className="tax-summary__stat-lbl">{taxColLabel}</span>
            <span className="tax-summary__stat-val tnum">
              {showByn ? fmtByn(summary.totalTax) : 'по строкам'}
            </span>
          </div>
        ) : null}
        <div className="tax-summary__stat">
          <span className="tax-summary__stat-lbl">Уплачено</span>
          <span className="tax-summary__stat-val tnum tax-summary__stat-val--muted">
            {summary.taxPaidCount}/{summary.count}
          </span>
        </div>
        <div className="tax-summary__stat">
          <span className="tax-summary__stat-lbl">Записей</span>
          <span className="tax-summary__stat-val tnum tax-summary__stat-val--muted">
            {summary.count}
          </span>
        </div>
      </div>
    </section>
  );
}
