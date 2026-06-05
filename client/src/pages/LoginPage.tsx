import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { Icon } from '../components/Icon';
import { useAppStore } from '../hooks/useAppStore';
import { loadSchedule } from '../state/loadSchedule';

const features = [
  {
    title: 'Расписание',
    text: 'Гибкое расписание недели, фокус-день и статусы уроков.',
    icon: 'M8 2v4M16 2v4M3 10h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  },
  {
    title: 'Студенты',
    text: 'Учет учеников, баланса, пополнений и заметок без лишней суеты.',
    icon: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  },
  {
    title: 'Оплаты',
    text: 'Журнал операций с привязкой к ученику и периоду.',
    icon: 'M4 7h16v10H4zM4 10h16M8 15h4',
  },
  {
    title: 'Налоги',
    text: 'Доход по месяцам — просто и понятно с автоматическим подсчетом налогов.',
    icon: 'M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6',
  },
  {
    title: 'Аналитика',
    text: 'Доход, статусы занятий и финансовые показатели.',
    icon: 'M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8',
  },
  {
    title: 'Настройки',
    text: 'Настройте LeO под свой формат работы: неделя, академический час, пополнения, архив и налоги.',
    icon: 'M12 3v3M12 18v3M4.8 6.8l2.1 2.1M17.1 17.1l2.1 2.1M3 12h3M18 12h3M4.8 17.2l2.1-2.1M17.1 6.9l2.1-2.1M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const setTutor = useSetAtom(tutorAtom);
  const store = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishLogin = async () => {
    await loadSchedule(store.get, store.set);
    navigate('/schedule', { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { tutor } = await api.login(email.trim().toLowerCase(), password);
      setTutor(tutor);
      await finishLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const googleStub = () => {
    setError('Вход через Google появится в следующей версии');
  };

  const forgotPasswordStub = () => {
    setError('Восстановление пароля появится в следующей версии');
  };

  return (
    <div className="login">
      <aside className="login__aside">
        <div className="login__glow login__glow--a" aria-hidden="true" />
        <div className="login__glow login__glow--b" aria-hidden="true" />
        <div className="login__brand">
          <span className="logo" aria-hidden="true">
            <span className="logo__mark" />
          </span>
          <span className="logo__copy">
            <span className="logo__word">LeO</span>
            <span className="logo__tagline">Сделано репетитором для репетиторов</span>
          </span>
        </div>

        <div className="login__content">
          <div className="login__pitch">
            <h1 className="login__title login__title--desktop">LeO помогает репетитору держать расписание, оплаты и баланс учеников под контролем</h1>
            <h1 className="login__title login__title--mobile">Расписание, оплаты и баланс учеников — в одном месте</h1>
            <p>Один рабочий экран для уроков, предоплат, долгов, заметок и дохода — без Excel и записных книжек.</p>
          </div>

          <div className="login__chips" aria-label="Ключевые возможности">
            <span className="chip">
              <i className="dot dot--credit" />
              Предоплата и долг наглядно
            </span>
            <span className="chip">
              <i className="dot dot--primary" />
              1-на-1 и мини-группы
            </span>
            <span className="chip">
              <i className="dot dot--amber" />
              Google Calendar — скоро
            </span>
          </div>

          <div className="login__features" aria-label="Основные функции LeO">
            {features.map((feature) => (
              <article className="login-feature" key={feature.title}>
                <span className="login-feature__icon">
                  <Icon d={feature.icon} size={18} />
                </span>
                <span>
                  <strong>{feature.title}</strong>
                  <span>{feature.text}</span>
                </span>
              </article>
            ))}
          </div>
        </div>

        <div className="login__decor" aria-hidden="true">
          <div className="decor-card decor-card--a">
            <span className="decor-card__time">16:00</span>
            <span className="decor-card__main">
              <strong>Мария</strong>
              <span>Математика</span>
            </span>
            <span className="decor-card__balance decor-card__balance--credit">+3 урока</span>
          </div>
          <div className="decor-card decor-card--b">
            <span className="decor-card__time">18:30</span>
            <span className="decor-card__main">
              <strong>Тимур</strong>
              <span>Английский</span>
            </span>
            <span className="decor-card__balance decor-card__balance--debt">-1 урок</span>
          </div>
        </div>
      </aside>

      <main className="login__main">
        <div className="login__mobile-brand">
          <span className="logo" aria-hidden="true">
            <span className="logo__mark" />
          </span>
          <span className="logo__copy">
            <span className="logo__word">LeO</span>
            <span className="logo__tagline">Сделано репетитором для репетиторов</span>
          </span>
        </div>

        <div className="login__card">
          <header className="login__head">
            <h2>С возвращением</h2>
            <p>Войдите, чтобы открыть своё расписание.</p>
          </header>

          <button type="button" className="btn btn--google" onClick={googleStub} disabled={loading}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c5.7 0 9.5-4 9.5-9.7 0-.65-.07-1.15-.16-1.65H12z"
              />
            </svg>
            Войти через Google
          </button>

          <div className="login__sep">
            <span>или по почте</span>
          </div>

          {error ? (
            <p className="login__alert" role="alert">
              {error}
            </p>
          ) : null}

          <form onSubmit={submit} className="login__form">
            <label className="field">
              <span className="field__label">Эл. почта</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">Пароль</span>
              <button type="button" className="field__aux" onClick={forgotPasswordStub}>
                Забыли?
              </button>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button
              type="submit"
              className={'btn btn--primary btn--block' + (loading ? ' is-loading' : '')}
              disabled={loading}
            >
              {loading ? <span className="spinner" aria-hidden="true" /> : null}
              {loading ? 'Входим…' : 'Войти'}
            </button>
          </form>

          <p className="login__foot">
            Нет аккаунта? <Link to="/register">Создать</Link>
          </p>
        </div>

        <div className="login__mobile-chips" aria-label="Ключевые возможности">
          <span className="mobile-chip">Расписание</span>
          <span className="mobile-chip">Баланс учеников</span>
          <span className="mobile-chip">Оплаты</span>
        </div>
      </main>
    </div>
  );
}
