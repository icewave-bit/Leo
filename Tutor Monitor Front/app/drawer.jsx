// ===== Wallet balance metaphor + lesson drawer =====

// A tilting balance beam: prepaid (credit) vs debt.
function Wallet({ student, compact }) {
  const { prepaid, debt, currency } = student;
  const net = prepaid - debt;
  const max = Math.max(prepaid, debt, 1);
  // tilt: positive net -> beam dips left (credit pan), negative -> dips right
  const ratio = Math.max(-1, Math.min(1, net / max));
  const tilt = -ratio * 9; // degrees
  const state = net > 0 ? "credit" : net < 0 ? "debt" : "even";

  return (
    <div className={"wallet wallet--" + state + (compact ? " wallet--compact" : "")}>
      <div className="wallet__beam-wrap">
        <div className="wallet__pivot"></div>
        <div className="wallet__beam" style={{ transform: `rotate(${tilt}deg)` }}>
          <div className="wallet__arm wallet__arm--credit">
            <span className="wallet__pan wallet__pan--credit">
              <span className="wallet__pan-amt">{tmMoney(prepaid, currency)}</span>
            </span>
          </div>
          <div className="wallet__arm wallet__arm--debt">
            <span className="wallet__pan wallet__pan--debt">
              <span className="wallet__pan-amt">{tmMoney(debt, currency)}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="wallet__legend">
        <span className="wallet__leg"><i className="dot dot--credit"></i>Предоплата</span>
        <span className="wallet__net">
          {net === 0 ? "Баланс нулевой" : net > 0 ? `Кредит ${tmMoney(net, currency)}` : `Долг ${tmMoney(-net, currency)}`}
        </span>
        <span className="wallet__leg wallet__leg--r">Долг<i className="dot dot--debt"></i></span>
      </div>
    </div>
  );
}

function Drawer({ lesson, onClose, onStatus, onPaid }) {
  if (!lesson) return null;
  const stu = tmStudent(lesson.studentId);
  const price = stu.group ? null : (lesson.dur * stu.rate);

  return (
    <>
      <div className="scrim" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-label="Детали урока">
        <header className="drawer__head">
          <span className="avatar avatar--lg" style={{ background: `oklch(0.62 0.13 ${stu.hue})` }}>{stu.initials}</span>
          <div className="drawer__head-txt">
            <h3>{stu.name}</h3>
            <span className="drawer__sub"><TypeIcon type={lesson.type} />{lesson.type === "group" ? "Групповой урок" : "Индивидуально"} · {stu.tz}</span>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Закрыть">✕</button>
        </header>

        <div className="drawer__time">
          <div>
            <span className="drawer__k">Когда</span>
            <span className="drawer__v">{TM_DAYS_FULL[lesson.day]}, {TM_WEEK_DATES[lesson.day]} июня · {tmTime(lesson.start)}–{tmTime(lesson.start + lesson.dur)}</span>
          </div>
          <a className="btn btn--primary btn--sm" href="#" onClick={(e) => e.preventDefault()}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M15 8l5-3v14l-5-3M3 6h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1z"/></svg>
            Join
          </a>
        </div>

        <div className="drawer__row">
          <span className="drawer__k">Статус</span>
          <div className="seg">
            {Object.keys(TM_STATUS).map((k) => (
              <button key={k} className={"seg__btn" + (lesson.status === k ? " is-active" : "")} onClick={() => onStatus(lesson.id, k)}>
                {TM_STATUS[k].ru}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer__row drawer__row--pay">
          <div>
            <span className="drawer__k">Оплата</span>
            {price != null ? <span className="drawer__price">{tmMoney(price, stu.currency)}</span> : <span className="drawer__price">по ставке группы</span>}
          </div>
          <button className={"toggle" + (lesson.paid ? " is-on" : "")} onClick={() => onPaid(lesson.id, !lesson.paid)}>
            <span className="toggle__knob"></span>
            <span className="toggle__label">{lesson.paid ? "Оплачен" : "Не оплачен"}</span>
          </button>
        </div>

        <div className="drawer__wallet">
          <span className="drawer__k">Баланс ученика</span>
          <Wallet student={stu} />
        </div>

        <div className="drawer__note">
          <span className="drawer__k">Заметка</span>
          <p>{stu.note}</p>
        </div>
      </aside>
    </>
  );
}

Object.assign(window, { Wallet, Drawer });
