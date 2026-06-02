import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { Navigate, Outlet } from 'react-router-dom';
import { authLoadingAtom, tutorAtom } from '../atoms/auth';
import { useAppStore } from '../hooks/useAppStore';
import { loadSchedule } from '../state/loadSchedule';

export function AuthGate() {
  const loading = useAtomValue(authLoadingAtom);
  const tutor = useAtomValue(tutorAtom);
  const store = useAppStore();

  useEffect(() => {
    if (!tutor) return;
    void loadSchedule(store.get, store.set).catch(() => {
      /* error stored in scheduleLoadErrorAtom */
    });
  }, [tutor?.id, store]);

  if (loading) {
    return (
      <div className="login__main" style={{ minHeight: '100vh' }}>
        <p style={{ color: 'var(--muted)' }}>Загрузка…</p>
      </div>
    );
  }

  if (!tutor) return <Navigate to="/login" replace />;

  return <Outlet />;
}
