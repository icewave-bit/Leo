import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthBootstrap } from './components/AuthBootstrap';
import { AuthGate } from './components/AuthGate';
import { AppShell } from './components/AppShell';
import { themeAtom } from './atoms/schedule';
import { authLoadingAtom, tutorAtom } from './atoms/auth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SchedulePage } from './pages/SchedulePage';
import { StudentsPage } from './pages/StudentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ArchivePage } from './pages/ArchivePage';
import { PaymentsPage } from './pages/PaymentsPage';
import { TaxesPage } from './pages/TaxesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

function GuestOnly({ children }: { children: React.ReactNode }) {
  const loading = useAtomValue(authLoadingAtom);
  const tutor = useAtomValue(tutorAtom);
  if (loading) return null;
  if (tutor) return <Navigate to="/schedule" replace />;
  return children;
}

function ThemeSync() {
  const theme = useAtomValue(themeAtom);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap />
      <ThemeSync />
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnly>
              <RegisterPage />
            </GuestOnly>
          }
        />
        <Route element={<AuthGate />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/schedule" replace />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="students/:studentId" element={<StudentsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="taxes" element={<TaxesPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="archive" element={<ArchivePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/schedule" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
