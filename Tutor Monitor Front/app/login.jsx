// ===== Login screen =====
function Login({ onLogin }) {
  const [email, setEmail] = React.useState("anna@tutormonitor.app");
  const [pass, setPass] = React.useState("••••••••");
  const [loading, setLoading] = React.useState(false);

  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(onLogin, 650);
  };

  return (
    <div className="login">
      {/* Brand / story panel */}
      <aside className="login__aside">
        <div className="login__brand">
          <span className="logo" aria-hidden="true">
            <span className="logo__mark"></span>
          </span>
          <span className="logo__word">Tutor&nbsp;Monitor</span>
        </div>

        <div className="login__pitch">
          <h1>Расписание, оплаты и баланс учеников — в одном спокойном месте.</h1>
          <p>Веди занятия, отмечай оплаты в один клик и делись ссылкой на расписание. Без таблиц и хаоса.</p>
        </div>

        <div className="login__chips">
          <span className="chip"><i className="dot dot--credit"></i>Предоплата и долг наглядно</span>
          <span className="chip"><i className="dot dot--primary"></i>1-на-1 и группы</span>
          <span className="chip"><i className="dot dot--amber"></i>Google Calendar</span>
        </div>

        <div className="login__decor" aria-hidden="true">
          <div className="decor-card decor-card--a">
            <span className="decor-card__time">09:00</span>
            <span className="decor-card__name">Мария · IELTS</span>
            <i className="dot dot--credit"></i>
          </div>
          <div className="decor-card decor-card--b">
            <span className="decor-card__time">16:00</span>
            <span className="decor-card__name">Тимур</span>
            <i className="dot dot--debt"></i>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="login__main">
        <div className="login__card">
          <header className="login__head">
            <h2>С возвращением</h2>
            <p>Войдите, чтобы открыть своё расписание.</p>
          </header>

          <button className="btn btn--google" type="button" onClick={() => { setLoading(true); setTimeout(onLogin, 650); }}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c5.7 0 9.5-4 9.5-9.7 0-.65-.07-1.15-.16-1.65H12z"/>
            </svg>
            Войти через Google
          </button>

          <div className="login__sep"><span>или по почте</span></div>

          <form onSubmit={submit} className="login__form">
            <label className="field">
              <span className="field__label">Эл. почта</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="field">
              <span className="field__label">Пароль</span>
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
              <a className="field__aux" href="#" onClick={(e) => e.preventDefault()}>Забыли?</a>
            </label>

            <button className={"btn btn--primary btn--block" + (loading ? " is-loading" : "")} type="submit" disabled={loading}>
              {loading ? <span className="spinner" aria-hidden="true"></span> : null}
              {loading ? "Входим…" : "Войти"}
            </button>
          </form>

          <p className="login__foot">
            Нет аккаунта? <a href="#" onClick={(e) => e.preventDefault()}>Создать</a>
          </p>
        </div>
      </main>
    </div>
  );
}

window.Login = Login;
