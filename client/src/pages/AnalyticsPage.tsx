import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import {
  analyticsCustomFromAtom,
  analyticsCustomToAtom,
  analyticsPeriodAtom,
  analyticsStudentIdAtom,
} from '../atoms/analytics';
import { AnalyticsDashboard } from '../components/analytics/AnalyticsDashboard';
import { useAppStore } from '../hooks/useAppStore';
import { loadAnalytics } from '../state/loadAnalytics';

export function AnalyticsPage() {
  const store = useAppStore();
  const period = useAtomValue(analyticsPeriodAtom);
  const studentId = useAtomValue(analyticsStudentIdAtom);
  const customFrom = useAtomValue(analyticsCustomFromAtom);
  const customTo = useAtomValue(analyticsCustomToAtom);

  useEffect(() => {
    void loadAnalytics(store.get, store.set);
  }, [store, period, studentId, customFrom, customTo]);

  return (
    <div className="page">
      <header className="top">
        <div className="top__l">
          <h1 className="top__title">Аналитика</h1>
        </div>
      </header>

      <div className="analytics-board">
        <AnalyticsDashboard />
      </div>
    </div>
  );
}
