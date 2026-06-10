import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { tutorAtom } from '../atoms/auth';
import { lessonsAtom, scheduleLoadErrorAtom, studentsAtom } from '../atoms/schedule';
import { resolvedThemeAtom, themeAtom } from '../atoms/theme';
import type { ResolvedTheme, ThemePreference } from '../atoms/theme';
import { api } from '../api/client';
import { useAppStore } from '../hooks/useAppStore';
import { useMobile } from '../hooks/useMobile';
import { loadSchedule } from '../state/loadSchedule';
import { Icon } from './Icon';
import { LogoBrand } from './LogoBrand';

export type ShellOutletContext = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
  mobile: boolean;
};

const NAV = [
  {
    id: 'schedule',
    to: '/schedule',
    label: 'Расписание',
    mobileLabel: 'Распис.',
    icon: 'M7 2v3M17 2v3M3 8h18M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  },
  {
    id: 'students',
    to: '/students',
    label: 'Студенты',
    mobileLabel: 'Студенты',
    icon: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 13c2.2 0 4 1.6 4 4',
  },
  {
    id: 'payments',
    to: '/payments',
    label: 'Оплаты',
    mobileLabel: 'Оплаты',
    icon: 'M3 7h18v10H3zM3 10h18M7 14h3',
  },
  {
    id: 'taxes',
    to: '/taxes',
    label: 'Налоги',
    mobileLabel: 'Налоги',
    icon: 'M4 4h16v4H4zM4 10h10v10H4zM16 10h4v4h-4v6h-4',
  },
  {
    id: 'analytics',
    to: '/analytics',
    label: 'Аналитика',
    mobileLabel: 'Аналит.',
    icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  },
  {
    id: 'settings',
    to: '/settings',
    label: 'Настройки',
    mobileLabel: 'Настр.',
    icon: 'M12 9a3 3 0 100 6 3 3 0 000-6zM4 12l-1.5-1 1.5-3 1.8.5M20 12l1.5-1-1.5-3-1.8.5M12 4V2M12 22v-2',
  },
] as const;

function SidebarNav({ mobile }: { mobile: boolean }) {
  const tutor = useAtomValue(tutorAtom);
  const navigate = useNavigate();

  const setTutor = useSetAtom(tutorAtom);
  const setStudents = useSetAtom(studentsAtom);
  const setLessons = useSetAtom(lessonsAtom);

  const logout = async () => {
    await api.logout();
    setTutor(null);
    setStudents([]);
    setLessons([]);
    navigate('/login', { replace: true });
  };

  if (mobile) {
    return (
      <nav className="botnav" style={{ '--botnav-cols': NAV.length } as React.CSSProperties}>
        {NAV.map((n) => (
          <NavLink
            key={n.id}
            to={n.to}
            className={({ isActive }) => 'botnav__item' + (isActive ? ' is-active' : '')}
            aria-label={n.label}
          >
            <Icon d={n.icon} />
            <span>{n.mobileLabel}</span>
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <aside className="side">
      <div className="side__brand">
        <LogoBrand variant="app" />
      </div>
      <nav className="side__nav">
        {NAV.map((n) => (
          <NavLink
            key={n.id}
            to={n.to}
            className={({ isActive }) => 'side__item' + (isActive ? ' is-active' : '')}
          >
            <Icon d={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="side__user">
        <span className="avatar">
          {tutor?.initials}
        </span>
        <span className="side__user-txt">
          <strong>{tutor?.name}</strong>
          <span>{tutor?.subject ?? tutor?.email}</span>
        </span>
        <button type="button" className="link" onClick={logout} style={{ marginLeft: 'auto' }}>
          Выйти
        </button>
      </div>
    </aside>
  );
}

function ScheduleLoadBanner() {
  const error = useAtomValue(scheduleLoadErrorAtom);
  const setError = useSetAtom(scheduleLoadErrorAtom);
  const store = useAppStore();

  if (!error) return null;

  const retry = () => {
    setError(null);
    void loadSchedule(store.get, store.set).catch(() => {});
  };

  return (
    <div className="load-error" role="alert">
      <p>{error}</p>
      <button type="button" className="btn btn--ghost btn--sm" onClick={retry}>
        Повторить
      </button>
    </div>
  );
}

export function AppShell() {
  const [theme, setTheme] = useAtom(themeAtom);
  const resolvedTheme = useAtomValue(resolvedThemeAtom);
  const mobile = useMobile();

  return (
    <div className={'app' + (mobile ? ' app--mobile' : '')}>
      <SidebarNav mobile={mobile} />
      <div className="app__main">
        <ScheduleLoadBanner />
        <Outlet context={{ theme, resolvedTheme, setTheme, mobile } satisfies ShellOutletContext} />
      </div>
    </div>
  );
}
