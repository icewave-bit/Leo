export interface AnalyticsKpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'primary' | 'credit' | 'debt' | 'amber' | 'neutral';
}

export function AnalyticsKpiCard({ label, value, hint, tone = 'neutral' }: AnalyticsKpiCardProps) {
  return (
    <article className={'analytics-kpi analytics-kpi--' + tone}>
      <span className="analytics-kpi__lbl">{label}</span>
      <span className="analytics-kpi__val tnum">{value}</span>
      {hint ? <span className="analytics-kpi__hint">{hint}</span> : null}
    </article>
  );
}
