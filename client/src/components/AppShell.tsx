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
import type { LineMdIconName } from '../icons/lineMd';

export type ShellOutletContext = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
  mobile: boolean;
};

const NAV: { id: string; to: string; label: string; mobileLabel: string; icon: LineMdIconName }[] = [
  {
    id: 'schedule',
    to: '/schedule',
    label: 'Расписание',
    mobileLabel: 'Распис.',
    icon: 'calendar',
  },
  {
    id: 'students',
    to: '/students',
    label: 'Студенты',
    mobileLabel: 'Студенты',
    icon: 'account',
  },
  {
    id: 'payments',
    to: '/payments',
    label: 'Оплаты',
    mobileLabel: 'Оплаты',
    icon: 'clipboard-list',
  },
  {
    id: 'taxes',
    to: '/taxes',
    label: 'Налоги',
    mobileLabel: 'Налоги',
    icon: 'document-report',
  },
  {
    id: 'analytics',
    to: '/analytics',
    label: 'Аналитика',
    mobileLabel: 'Аналит.',
    icon: 'list-3',
  },
  {
    id: 'settings',
    to: '/settings',
    label: 'Настройки',
    mobileLabel: 'Настр.',
    icon: 'cog',
  },
];

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
            <Icon icon={n.icon} />
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
            <Icon icon={n.icon} />
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
