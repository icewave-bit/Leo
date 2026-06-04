import { useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import {
  analyticsCustomFromAtom,
  analyticsCustomToAtom,
  analyticsErrorAtom,
  analyticsLessonsAtom,
  analyticsLoadingAtom,
  analyticsMovementsAtom,
  analyticsPeriodAtom,
  analyticsStudentIdAtom,
} from '../../atoms/analytics';
import { studentsAtom } from '../../atoms/schedule';
import {
  computeFinanceByCurrency,
  computeKpis,
  computeReplenishmentIncomeTimeline,
  computeStatusBreakdown,
  computeTimeline,
  computeWeekdayDistribution,
  fmtPct,
  portfolioSummary,
  shouldBucketByWeek,
  totalReplenishmentLessons,
} from '../../utils/analytics';
import { periodRange } from '../../utils/paymentJournal';
import { studentCountLabel } from '../../utils/format';
import { PeriodPicker } from '../payments/PeriodPicker';
import { StudentPicker } from '../payments/StudentPicker';
import { AnalyticsBarChart } from './AnalyticsBarChart';
import { AnalyticsFinancePanel } from './AnalyticsFinancePanel';
import { AnalyticsIncomePanel } from './AnalyticsIncomePanel';
import { AnalyticsKpiCard } from './AnalyticsKpiCard';
import { AnalyticsStatusBreakdown } from './AnalyticsStatusBreakdown';

const ANALYTICS_PERIOD_ATOMS = {
  period: analyticsPeriodAtom,
  customFrom: analyticsCustomFromAtom,
  customTo: analyticsCustomToAtom,
};

export function AnalyticsDashboard() {
  const tutor = useAtomValue(tutorAtom);
  const students = useAtomValue(studentsAtom);
  const lessons = useAtomValue(analyticsLessonsAtom);
  const movements = useAtomValue(analyticsMovementsAtom);
  const loading = useAtomValue(analyticsLoadingAtom);
  const error = useAtomValue(analyticsErrorAtom);
  const [studentId, setStudentId] = useAtom(analyticsStudentIdAtom);
  const period = useAtomValue(analyticsPeriodAtom);
  const customFrom = useAtomValue(analyticsCustomFromAtom);
  const customTo = useAtomValue(analyticsCustomToAtom);

  const tz = tutor?.timezone ?? 'UTC';
  const range = periodRange(period, tz, { from: customFrom, to: customTo });

  const kpis = useMemo(
    () => computeKpis(lessons, students, studentId),
    [lessons, students, studentId],
  );
  const bucketByWeek = useMemo(
    () => shouldBucketByWeek(range.from, range.to),
    [range.from, range.to],
  );
  const timeline = useMemo(
    () => computeTimeline(lessons, tz, bucketByWeek),
    [lessons, tz, bucketByWeek],
  );
  const statusSlices = useMemo(() => computeStatusBreakdown(lessons), [lessons]);
  const weekdays = useMemo(
    () => computeWeekdayDistribution(lessons, tz),
    [lessons, tz],
  );
  const finance = useMemo(
    () => computeFinanceByCurrency(movements, students, studentId),
    [movements, students, studentId],
  );
  const incomeBuckets = useMemo(
    () =>
      computeReplenishmentIncomeTimeline(
        movements,
        students,
        tz,
        bucketByWeek,
        studentId,
      ),
    [movements, students, tz, bucketByWeek, studentId],
  );
  const portfolio = useMemo(
    () => portfolioSummary(students, studentId),
    [students, studentId],
  );

  const timelineItems = timeline.map((b) => ({
    label: b.label,
    value: b.count,
    secondary: b.hours > 0 ? `${b.hours} ч` : undefined,
  }));

  const weekdayItems = weekdays.map((b) => ({
    label: b.label,
    value: b.count,
  }));

  const incomeTotal = totalReplenishmentLessons(incomeBuckets);

  return (
    <div className="analytics-page">
      <section className="pay-toolbar analytics-toolbar" aria-label="Фильтры аналитики">
        <div className="pay-toolbar__fields">
          <div className="pay-toolbar__field pay-toolbar__field--student">
            <span className="pay-toolbar__lbl">Ученик</span>
            <StudentPicker students={students} value={studentId} onChange={setStudentId} />
          </div>
          <div className="pay-toolbar__field pay-toolbar__field--period">
            <span className="pay-toolbar__lbl">Период</span>
            <PeriodPicker timezone={tz} atoms={ANALYTICS_PERIOD_ATOMS} />
          </div>
        </div>
        <div className="pay-toolbar__bar">
          <p className="pay-toolbar__range">{range.label}</p>
          {!studentId ? (
            <p className="analytics-toolbar__meta">
              {portfolio.total} уч. · {portfolio.withDebt} с долгом · {portfolio.lessonBalance} по урокам
            </p>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="pay-journal-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="analytics-page__body" aria-busy={loading}>
        {loading ? (
          <p className="analytics-page__loading">Загрузка аналитики…</p>
        ) : (
          <>
            <div className="analytics-kpi-grid">
              <AnalyticsKpiCard
                label="Проведено"
                value={String(kpis.completedLessons)}
                hint={`из ${kpis.totalLessons} уроков`}
                tone="credit"
              />
              <AnalyticsKpiCard
                label="Академ. часы"
                value={String(kpis.academicHours)}
                hint="без отмен"
                tone="primary"
              />
              <AnalyticsKpiCard
                label="Конверсия"
                value={fmtPct(kpis.completionRate)}
                hint="проведено / завершённые"
                tone="amber"
              />
              <AnalyticsKpiCard
                label="Отмены и неявки"
                value={String(kpis.cancelledLessons + kpis.noShowLessons)}
                hint={fmtPct(kpis.cancellationRate) + ' от завершённых'}
                tone="debt"
              />
              <AnalyticsKpiCard
                label="Активные ученики"
                value={String(kpis.activeStudents)}
                hint={studentCountLabel(kpis.activeStudents)}
              />
              <AnalyticsKpiCard
                label="Регулярные"
                value={fmtPct(kpis.recurringShare)}
                hint={`${kpis.soloLessons} инд. · ${kpis.groupLessons} груп.`}
              />
            </div>

            <div className="analytics-grid">
              <AnalyticsBarChart
                title={bucketByWeek ? 'Уроки по неделям' : 'Уроки по дням'}
                subtitle="Без отменённых"
                items={timelineItems}
                valueLabel=""
              />
              <AnalyticsStatusBreakdown slices={statusSlices} />
              <AnalyticsBarChart
                title="Нагрузка по дням недели"
                subtitle="Распределение занятий"
                items={weekdayItems}
                valueLabel=""
              />
              <AnalyticsIncomePanel total={incomeTotal} buckets={incomeBuckets} />
              <AnalyticsFinancePanel rows={finance} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
