import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { useAppStore } from '../hooks/useAppStore';
import { loadSchedule } from '../state/loadSchedule';

export function LoginPage() {
  const navigate = useNavigate();
  const setTutor = useSetAtom(tutorAtom);
  const store = useAppStore();
  const [email, setEmail] = useState('anna@tutormonitor.app');
  const [password, setPassword] = useState('demo-password-123');
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

  return (
    <div className="login">
      <aside className="login__aside">
        <div className="login__brand">
          <span className="logo" aria-hidden="true">
            <span className="logo__mark" />
          </span>
          <span className="logo__word">Tutor&nbsp;Monitor</span>
        </div>
        <div className="login__pitch">
          <h1>Расписание, оплаты и баланс учеников — в одном спокойном месте.</h1>
          <p>Веди занятия, отмечай оплаты в один клик и делись ссылкой на расписание.</p>
        </div>
        <div className="login__chips">
          <span className="chip">
            <i className="dot dot--credit" />
            Предоплата и долг наглядно
          </span>
          <span className="chip">
            <i className="dot dot--primary" />
            1-на-1 и группы
          </span>
        </div>
      </aside>

      <main className="login__main">
        <div className="login__card">
          <header className="login__head">
            <h2>С возвращением</h2>
            <p>Войдите, чтобы открыть своё расписание.</p>
          </header>

          <button type="button" className="btn btn--google" onClick={googleStub}>
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
            <p style={{ color: 'var(--c-debt)', fontSize: 14, margin: '0 0 12px' }}>{error}</p>
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
      </main>
    </div>
  );
}
