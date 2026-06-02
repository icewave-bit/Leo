// ===== App shell + root =====
const { useState, useEffect } = React;

function useMobile() {
  const [m, setM] = useState(window.matchMedia("(max-width: 880px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 880px)");
    const fn = () => setM(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return m;
}

const NAV = [
  { id: "sched", label: "Расписание", icon: "M7 2v3M17 2v3M3 8h18M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
  { id: "students", label: "Студенты", icon: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 13c2.2 0 4 1.6 4 4" },
  { id: "pay", label: "Оплаты", icon: "M3 7h18v10H3zM3 10h18M7 14h3" },
  { id: "stats", label: "Аналитика", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { id: "set", label: "Настройки", icon: "M12 9a3 3 0 100 6 3 3 0 000-6zM4 12l-1.5-1 1.5-3 1.8.5M20 12l1.5-1-1.5-3-1.8.5M12 4V2M12 22v-2" },
];

function Icon({ d }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={d} /></svg>;
}

function Sidebar({ active, setActive, mobile }) {
  if (mobile) {
    return (
      <nav className="botnav">
        {NAV.map((n) => (
          <button key={n.id} className={"botnav__item" + (active === n.id ? " is-active" : "")} onClick={() => setActive(n.id)}>
            <Icon d={n.icon} /><span>{n.label}</span>
          </button>
        ))}
      </nav>
    );
  }
  return (
    <aside className="side">
      <div className="side__brand">
        <span className="logo"><span className="logo__mark"></span></span>
        <span className="logo__word">Tutor Monitor</span>
      </div>
      <nav className="side__nav">
        {NAV.map((n) => (
          <button key={n.id} className={"side__item" + (active === n.id ? " is-active" : "")} onClick={() => setActive(n.id)}>
            <Icon d={n.icon} /><span>{n.label}</span>
            {n.id === "pay" ? <span className="side__badge">3</span> : null}
          </button>
        ))}
      </nav>
      <div className="side__user">
        <span className="avatar" style={{ background: "oklch(0.6 0.13 250)" }}>{TM_TUTOR.initials}</span>
        <span className="side__user-txt">
          <strong>{TM_TUTOR.name}</strong>
          <span>{TM_TUTOR.subject}</span>
        </span>
      </div>
    </aside>
  );
}

const VARIANTS = [
  { id: "week", label: "Неделя" },
  { id: "timeline", label: "Таймлайн" },
  { id: "agenda", label: "Агенда" },
];

function Topbar({ variant, setVariant, theme, setTheme, mobile, onNew }) {
  return (
    <header className="top">
      <div className="top__l">
        <h1 className="top__title">Расписание</h1>
        {!mobile && (
          <div className="weeknav">
            <button className="iconbtn" aria-label="Назад">‹</button>
            <span className="weeknav__label">1–7 июня 2026</span>
            <button className="iconbtn" aria-label="Вперёд">›</button>
            <button className="btn btn--ghost btn--sm">Сегодня</button>
          </div>
        )}
      </div>
      <div className="top__r">
        <div className="seg seg--variant">
          {VARIANTS.map((v) => (
            <button key={v.id} className={"seg__btn" + (variant === v.id ? " is-active" : "")} onClick={() => setVariant(v.id)}>{v.label}</button>
          ))}
        </div>
        <button className="iconbtn iconbtn--round" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Тема">
          {theme === "light"
            ? <svg viewBox="0 0 24 24" width="18" height="18"><path d="M21 13a8 8 0 11-9.5-9 6.5 6.5 0 009.5 9z"/></svg>
            : <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19"/></svg>}
        </button>
        <button className="btn btn--primary btn--sm" onClick={onNew}>+ Урок</button>
      </div>
    </header>
  );
}

function RightRail({ lessons, onSelectStudent }) {
  const today = 2;
  const todayCount = lessons.filter((l) => l.day === today && l.status !== "cancelled").length;
  const unpaid = lessons.filter((l) => l.status !== "cancelled" && !l.paid && !tmStudent(l.studentId).group).length;
  const hours = lessons.filter((l) => l.status !== "cancelled").reduce((a, l) => a + l.dur, 0);
  const featured = tmStudent("s2");

  return (
    <aside className="rail">
      <div className="rail__card rail__stats">
        <h4>Сегодня, среда</h4>
        <div className="stat">
          <span className="stat__big">{todayCount}</span>
          <span className="stat__lbl">занятий сегодня</span>
        </div>
        <div className="rail__split">
          <div className="stat stat--sm">
            <span className="stat__big" style={{ color: "var(--c-debt)" }}>{unpaid}</span>
            <span className="stat__lbl">не оплачено</span>
          </div>
          <div className="stat stat--sm">
            <span className="stat__big">{hours}<span className="stat__unit">ч</span></span>
            <span className="stat__lbl">на неделе</span>
          </div>
        </div>
      </div>

      <div className="rail__card">
        <div className="rail__card-head">
          <h4>Требует внимания</h4>
          <button className="link" onClick={() => onSelectStudent("s2")}>профиль</button>
        </div>
        <div className="rail__student" onClick={() => onSelectStudent("s2")}>
          <span className="avatar avatar--sm" style={{ background: `oklch(0.62 0.13 ${featured.hue})` }}>{featured.initials}</span>
          <span className="rail__student-txt"><strong>{featured.name}</strong><span>2 урока не оплачены</span></span>
        </div>
        <Wallet student={featured} compact />
      </div>
    </aside>
  );
}

function App() {
  const [screen, setScreen] = useState("login");
  const [theme, setTheme] = useState("light");
  const [variant, setVariant] = useState("week");
  const [active, setActive] = useState("sched");
  const [activeDay, setActiveDay] = useState(2);
  const [selectedId, setSelectedId] = useState(null);
  const [rev, setRev] = useState(0);
  const mobile = useMobile();

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const lessons = TM_LESSONS;
  const selected = selectedId ? lessons.find((l) => l.id === selectedId) : null;

  const onStatus = (id, st) => { const l = lessons.find((x) => x.id === id); l.status = st; setRev((r) => r + 1); };
  const onPaid = (id, p) => { const l = lessons.find((x) => x.id === id); l.paid = p; setRev((r) => r + 1); };

  // open a student's most relevant lesson when clicking from rail
  const openStudent = (sid) => { const l = lessons.find((x) => x.studentId === sid); if (l) setSelectedId(l.id); };

  const effVariant = mobile ? (variant === "week" ? "week" : variant) : variant;

  if (screen === "login") return <Login onLogin={() => setScreen("app")} />;

  return (
    <div className={"app" + (mobile ? " app--mobile" : "")}>
      <Sidebar active={active} setActive={setActive} mobile={mobile} />
      <div className="app__main">
        <Topbar variant={variant} setVariant={setVariant} theme={theme} setTheme={setTheme} mobile={mobile} onNew={() => openStudent("s1")} />
        <div className="app__content">
          <main className="board" key={rev}>
            {effVariant === "week" && <WeekGrid onSelect={setSelectedId} />}
            {effVariant === "timeline" && <FocusTimeline onSelect={setSelectedId} activeDay={activeDay} setActiveDay={setActiveDay} />}
            {effVariant === "agenda" && <AgendaList onSelect={setSelectedId} />}
          </main>
          {!mobile && <RightRail lessons={lessons} onSelectStudent={openStudent} />}
        </div>
      </div>
      {selected && <Drawer lesson={selected} onClose={() => setSelectedId(null)} onStatus={onStatus} onPaid={onPaid} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
