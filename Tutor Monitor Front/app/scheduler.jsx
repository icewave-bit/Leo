// ===== Scheduler — three comparable concepts =====
const HOUR_START = 8, HOUR_END = 20;

function lessonTint(hue, strong) {
  // warm, low-chroma tints from student hue; theme-aware via oklch
  return strong
    ? `oklch(0.62 0.14 ${hue})`
    : `var(--surf)`;
}
function lessonStyle(stu, status) {
  const cancelled = status === "cancelled";
  return {
    "--lh": stu.hue,
    borderLeft: `3px solid oklch(0.62 0.15 ${stu.hue})`,
    background: `oklch(var(--tint-l) 0.04 ${stu.hue})`,
    opacity: cancelled ? 0.55 : 1,
  };
}

function PaidDot({ paid }) {
  return <i className={"pdot " + (paid ? "pdot--paid" : "pdot--unpaid")} title={paid ? "Оплачен" : "Не оплачен"}></i>;
}
function TypeIcon({ type }) {
  if (type === "group")
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" className="ticon" aria-hidden="true">
        <circle cx="9" cy="8" r="3.2"/><circle cx="16" cy="9" r="2.6"/>
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M14 19c0-2.3 1.6-3.8 4-3.8s4 1.5 4 3.8"/>
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" className="ticon" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4"/><path d="M5 19c0-3.4 3-5.6 7-5.6s7 2.2 7 5.6"/>
    </svg>
  );
}

/* ---------- A. Week grid ---------- */
function WeekGrid({ onSelect }) {
  const hours = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);
  const pxH = 58;
  const colH = (HOUR_END - HOUR_START) * pxH;

  return (
    <div className="wg">
      <div className="wg__head">
        <div className="wg__gutter"></div>
        {TM_DAYS.map((d, i) => (
          <div key={i} className={"wg__day" + (i === 2 ? " is-today" : "")}>
            <span className="wg__dow">{d}</span>
            <span className="wg__date">{TM_WEEK_DATES[i]}</span>
          </div>
        ))}
      </div>
      <div className="wg__body" style={{ height: colH }}>
        <div className="wg__gutter wg__gutter--rows">
          {hours.map((h) => (
            <div key={h} className="wg__hour" style={{ height: pxH }}><span>{tmTime(h)}</span></div>
          ))}
        </div>
        {TM_DAYS.map((d, di) => (
          <div key={di} className={"wg__col" + (di === 2 ? " is-today" : "")}>
            {hours.map((h) => <div key={h} className="wg__slot" style={{ height: pxH }}></div>)}
            {TM_LESSONS.filter((l) => l.day === di).map((l) => {
              const stu = tmStudent(l.studentId);
              const top = (l.start - HOUR_START) * pxH;
              const height = l.dur * pxH - 4;
              return (
                <button key={l.id} className={"ev ev--" + l.status} style={{ top, height, ...lessonStyle(stu, l.status) }} onClick={() => onSelect(l.id)}>
                  <span className="ev__time">{tmTime(l.start)}</span>
                  <span className="ev__name">{stu.name}</span>
                  <span className="ev__meta"><TypeIcon type={l.type} /><PaidDot paid={l.paid} /></span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- B. Focus timeline (single day) ---------- */
function FocusTimeline({ onSelect, activeDay, setActiveDay }) {
  const dayLessons = TM_LESSONS.filter((l) => l.day === activeDay).sort((a, b) => a.start - b.start);
  const hours = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);
  const pxH = 70;

  return (
    <div className="ft">
      <div className="ft__strip">
        {TM_DAYS.map((d, i) => {
          const count = TM_LESSONS.filter((l) => l.day === i).length;
          return (
            <button key={i} className={"ft__pill" + (i === activeDay ? " is-active" : "")} onClick={() => setActiveDay(i)}>
              <span className="ft__pill-dow">{d}</span>
              <span className="ft__pill-date">{TM_WEEK_DATES[i]}</span>
              {count > 0 ? <span className="ft__pill-count">{count}</span> : <span className="ft__pill-count ft__pill-count--empty">·</span>}
            </button>
          );
        })}
      </div>

      <div className="ft__head">
        <h3>{TM_DAYS_FULL[activeDay]}, {TM_WEEK_DATES[activeDay]} июня</h3>
        <span className="ft__sub">{dayLessons.length ? `${dayLessons.length} занятий` : "Свободный день"}</span>
      </div>

      {dayLessons.length === 0 ? (
        <div className="ft__empty">
          <div className="ft__empty-art" aria-hidden="true"></div>
          <p>На этот день уроков нет.</p>
          <button className="btn btn--soft">+ Добавить урок</button>
        </div>
      ) : (
        <div className="ft__rail">
          {dayLessons.map((l) => {
            const stu = tmStudent(l.studentId);
            return (
              <div key={l.id} className="ft__row">
                <div className="ft__axis">
                  <span className="ft__t">{tmTime(l.start)}</span>
                  <span className="ft__dur">{l.dur}ч</span>
                </div>
                <button className={"ft__card ev--" + l.status} style={lessonStyle(stu, l.status)} onClick={() => onSelect(l.id)}>
                  <span className="avatar" style={{ background: `oklch(0.62 0.13 ${stu.hue})` }}>{stu.initials}</span>
                  <span className="ft__card-main">
                    <span className="ft__card-name">{stu.name}<TypeIcon type={l.type} /></span>
                    <span className="ft__card-sub">{tmTime(l.start)}–{tmTime(l.start + l.dur)} · {TM_STATUS[l.status].ru}</span>
                  </span>
                  <span className="ft__card-side">
                    <PaidDot paid={l.paid} />
                    <span className="ft__join">Join</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- C. Agenda cards ---------- */
function AgendaList({ onSelect }) {
  const byDay = TM_DAYS.map((_, i) => TM_LESSONS.filter((l) => l.day === i).sort((a, b) => a.start - b.start));
  return (
    <div className="ag">
      {byDay.map((ls, di) =>
        ls.length === 0 ? null : (
          <section key={di} className="ag__group">
            <div className="ag__date">
              <span className={"ag__num" + (di === 2 ? " is-today" : "")}>{TM_WEEK_DATES[di]}</span>
              <span className="ag__dow">{TM_DAYS_FULL[di]}</span>
              <span className="ag__line"></span>
              <span className="ag__count">{ls.length}</span>
            </div>
            <div className="ag__cards">
              {ls.map((l) => {
                const stu = tmStudent(l.studentId);
                return (
                  <button key={l.id} className={"ag__card ev--" + l.status} style={lessonStyle(stu, l.status)} onClick={() => onSelect(l.id)}>
                    <span className="ag__time">
                      <strong>{tmTime(l.start)}</strong>
                      <span>{tmTime(l.start + l.dur)}</span>
                    </span>
                    <span className="avatar avatar--sm" style={{ background: `oklch(0.62 0.13 ${stu.hue})` }}>{stu.initials}</span>
                    <span className="ag__main">
                      <span className="ag__name">{stu.name}<TypeIcon type={l.type} /></span>
                      <span className="ag__status"><i className="sdot" style={{ background: TM_STATUS[l.status].dot }}></i>{TM_STATUS[l.status].ru}</span>
                    </span>
                    <span className="ag__pay"><PaidDot paid={l.paid} /></span>
                  </button>
                );
              })}
            </div>
          </section>
        )
      )}
    </div>
  );
}

Object.assign(window, { WeekGrid, FocusTimeline, AgendaList });
