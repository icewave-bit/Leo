import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { useAppStore } from '../hooks/useAppStore';
import { loadSchedule } from '../state/loadSchedule';

export function RegisterPage() {
  const navigate = useNavigate();
  const setTutor = useSetAtom(tutorAtom);
  const store = useAppStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { tutor } = await api.register({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setTutor(tutor);
      await loadSchedule(store.get, store.set);
      navigate('/schedule', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <main className="login__main" style={{ gridColumn: '1 / -1' }}>
        <div className="login__card">
          <header className="login__head">
            <h2>Создать аккаунт</h2>
            <p>Один репетитор — один аккаунт.</p>
          </header>
          {error ? (
            <p style={{ color: 'var(--c-debt)', fontSize: 14, margin: '0 0 12px' }}>{error}</p>
          ) : null}
          <form onSubmit={submit} className="login__form">
            <label className="field">
              <span className="field__label">Имя</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
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
              <span className="field__label">Пароль (мин. 8 символов)</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <button
              type="submit"
              className={'btn btn--primary btn--block' + (loading ? ' is-loading' : '')}
              disabled={loading}
            >
              {loading ? 'Создаём…' : 'Зарегистрироваться'}
            </button>
          </form>
          <p className="login__foot">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
