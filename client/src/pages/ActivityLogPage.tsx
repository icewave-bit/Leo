import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { tutorAtom } from '../atoms/auth';
import {
  activityLogCustomFromAtom,
  activityLogCustomToAtom,
  activityLogErrorAtom,
  activityLogItemsAtom,
  activityLogLoadingAtom,
  activityLogPeriodAtom,
  activityLogTotalAtom,
  activityLogStatusAtom,
  activityLogActorAtom,
  activityLogEntityAtom,
  activityLogStudentIdAtom,
  activityLogQueryAtom,
} from '../atoms/activityLog';
import { ActivityLogFeed } from '../components/activityLog/ActivityLogFeed';
import { ActivityLogFilters } from '../components/activityLog/ActivityLogFilters';
import { useAppStore } from '../hooks/useAppStore';
import { loadActivityLog } from '../state/loadActivityLog';
import { periodRange } from '../utils/paymentJournal';

export function ActivityLogPage() {
  const tutor = useAtomValue(tutorAtom);
  const items = useAtomValue(activityLogItemsAtom);
  const total = useAtomValue(activityLogTotalAtom);
  const loading = useAtomValue(activityLogLoadingAtom);
  const error = useAtomValue(activityLogErrorAtom);
  const period = useAtomValue(activityLogPeriodAtom);
  const customFrom = useAtomValue(activityLogCustomFromAtom);
  const customTo = useAtomValue(activityLogCustomToAtom);
  const status = useAtomValue(activityLogStatusAtom);
  const actor = useAtomValue(activityLogActorAtom);
  const entity = useAtomValue(activityLogEntityAtom);
  const studentId = useAtomValue(activityLogStudentIdAtom);
  const query = useAtomValue(activityLogQueryAtom);
  const store = useAppStore();

  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const periodLabel = periodRange(
    period,
    tz,
    { from: customFrom, to: customTo },
    new Date(),
    weekStartsOn,
  ).label;

  useEffect(() => {
    void loadActivityLog(store.get, store.set);
  }, [store, period, customFrom, customTo, status, actor, entity, studentId, query]);

  const hasMore = items.length < total;

  return (
    <div className="page">
      <header className="top">
        <div className="top__l">
          <Link to="/settings" className="archive-page__back">
            ← Настройки
          </Link>
          <h1 className="top__title">Журнал</h1>
          <p className="top__sub">
            Действия в приложении и ошибки запросов — с датой и фильтрами.
          </p>
        </div>
      </header>

      <div className="log-board">
        <div className="alog-page">
          <ActivityLogFilters timezone={tz} rangeLabel={periodLabel} total={total} />

          {error ? <p className="pay-journal-error">{error}</p> : null}

          {loading && items.length === 0 ? (
            <p className="pay-journal-empty">Загрузка…</p>
          ) : items.length === 0 ? (
            <p className="pay-journal-empty">Пока нет записей за выбранный период.</p>
          ) : (
            <>
              <ActivityLogFeed items={items} timezone={tz} />
              {hasMore ? (
                <div className="alog-more">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={loading}
                    onClick={() => void loadActivityLog(store.get, store.set, { append: true })}
                  >
                    {loading ? 'Загрузка…' : 'Ещё'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
