import { Link } from 'react-router-dom';
import {
  landingBalanceBullets,
  landingBalanceRows,
  landingFeatures,
  landingHeroChips,
  landingHeroPills,
  landingPlans,
  landingPreviewLessons,
  landingPricing,
  landingSteps,
} from '../data/landingContent';
import { LogoBrand } from '../components/LogoBrand';
import { Icon } from '../components/Icon';
import { landingPageSeo } from '../data/landingSeo';
import { usePageMeta } from '../hooks/usePageMeta';
import { useScrollReveal } from '../hooks/useScrollReveal';
import '../styles/landing.css';

export function LandingPage() {
  usePageMeta(landingPageSeo);
  useScrollReveal();

  return (
    <div className="landing">
      <header className="nav">
        <div className="wrap nav__in">
          <nav className="nav__links">
            <a href="#features">Возможности</a>
            <a href="#balance">Баланс</a>
            <a href="#how">Как это работает</a>
            <a href="#pricing">Цены</a>
          </nav>
          <div className="nav__cta">
            <Link className="btn btn--ghost btn--sm" to="/login">
              Войти
            </Link>
            <Link className="btn btn--primary btn--sm" to="/register">
              Начать бесплатно
            </Link>
            <button type="button" className="nav__burger" aria-label="Меню">
              <Icon icon="menu" size={20} />
            </button>
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <div className="hero__brand reveal">
              <img
                className="hero__brand-icon"
                src="/icons/icon-512.png"
                srcSet="/icons/icon-192.png 192w, /icons/icon-512.png 512w"
                sizes="72px"
                width={72}
                height={72}
                alt=""
                decoding="async"
              />
              <span className="hero__brand-word">LeO</span>
            </div>

            <h1 className="hero__headline reveal">
              помогает репетитору держать расписание, оплаты и баланс учеников под контролем
            </h1>
            <p className="hero__sub reveal">
              Один рабочий экран для уроков, предоплат, долгов, заметок и дохода — без Excel и
              записных книжек.
            </p>

            <div className="chips reveal">
              {landingHeroChips.map((chip) => (
                <span className="chip" key={chip.text}>
                  <i className={`dot dot--${chip.dot}`} />
                  {chip.text}
                </span>
              ))}
            </div>

            <div className="hero__cta reveal">
              <Link className="btn btn--primary btn--lg" to="/login">
                Открыть расписание
              </Link>
              <a className="btn btn--ghost btn--lg" href="#how">
                Как это работает
              </a>
            </div>

            <div className="hero__pills reveal">
              {landingHeroPills.map((pill) => (
                <div className="lpill" key={pill.time}>
                  <span className="lpill__time">{pill.time}</span>
                  <span className="lpill__main">
                    <strong>{pill.name}</strong>
                    <span>{pill.subject}</span>
                  </span>
                  <span className={`lpill__badge ${pill.badgeClass}`}>{pill.badge}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hpreview reveal" aria-hidden="true">
            <div className="hpreview__top">
              <span className="t1">
                <strong>Сегодня</strong> · среда, 3 июня
              </span>
              <span className="hpreview__count">3 урока</span>
            </div>
            {landingPreviewLessons.map((lesson) => (
              <div className="hprow" key={lesson.time}>
                <span className="hprow__bar" style={{ background: lesson.bar }} />
                <span className="hprow__time">{lesson.time}</span>
                <span className="hprow__main">
                  <strong>{lesson.title}</strong>
                  <span>{lesson.sub}</span>
                </span>
                <span className={`hpbadge ${lesson.paid ? 'hpbadge--paid' : 'hpbadge--due'}`}>
                  {lesson.paid ? 'Оплачен' : 'Не оплачен'}
                </span>
              </div>
            ))}
            <div className="hpreview__foot">
              <span className="hpfoot__l">Доход за неделю</span>
              <span className="hpfoot__v">€420</span>
            </div>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="wrap">
          <div className="shead reveal">
            <span className="kicker">Возможности</span>
            <h2>Шесть рабочих экранов — и ничего лишнего</h2>
            <p>Всё, что нужно репетитору каждый день, в одном спокойном интерфейсе.</p>
          </div>
          <div className="fgrid">
            {landingFeatures.map((feature) => (
              <div className="gcard reveal" key={feature.title}>
                <span className="gcard__ic">
                  <Icon icon={feature.icon} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="balance" id="balance">
        <div className="wrap balance__grid">
          <div className="balance__art reveal">
            {landingBalanceRows.map((row) => (
              <div key={row.name}>
                <div className="brow">
                  <span className="brow__l">
                    <span className="bava" style={{ background: row.gradient }}>
                      {row.initials}
                    </span>
                    <span>
                      <span className="brow__name">{row.name}</span>
                      <br />
                      <span className="brow__sub">{row.sub}</span>
                    </span>
                  </span>
                  <span className={`bbadge ${row.badgeClass}`}>{row.badge}</span>
                </div>
                {row.meterClass ? (
                  <div className="bmeter">
                    <span className={row.meterClass} style={{ width: row.meterWidth }} />
                  </div>
                ) : null}
                <div style={{ height: 14 }} />
              </div>
            ))}
          </div>

          <div className="balance__copy reveal">
            <div className="shead" style={{ marginBottom: 0 }}>
              <span className="kicker">Баланс ученика</span>
              <h2>Видно сразу: предоплата или долг</h2>
              <p>
                Каждый проведённый урок списывает оплату, каждый платёж — пополняет. Зелёный — у
                ученика кредит, красный — пора напомнить об оплате.
              </p>
            </div>
            <ul className="flist">
              {landingBalanceBullets.map((item) => (
                <li key={item.title}>
                  <span className="tick">
                    <Icon icon="confirm" />
                  </span>
                  <span>
                    <strong>{item.title}</strong> {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <div className="wrap">
          <div className="shead shead--center reveal">
            <span className="kicker">Как это работает</span>
            <h2>Запуск за один вечер</h2>
          </div>
          <div className="steps">
            {landingSteps.map((step) => (
              <div className="step reveal" key={step.title}>
                <div className="step__n" />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="wrap">
          <div className="shead shead--center reveal">
            <span className="kicker">{landingPricing.kicker}</span>
            <h2>{landingPricing.title}</h2>
            <p>{landingPricing.subtitle}</p>
          </div>
          <div className="plans">
            {landingPlans.map((plan) => (
              <div
                className={
                  'plan reveal' +
                  (plan.popular ? ' plan--pop' : '') +
                  ('comingSoon' in plan && plan.comingSoon ? ' plan--soon' : '')
                }
                key={plan.name}
              >
                {plan.popular ? <span className="plan__badge">Популярный</span> : null}
                <span className="plan__name">{plan.name}</span>
                <div className="plan__price">
                  {'comingSoon' in plan && plan.comingSoon ? (
                    <span className="plan__price-soon">{landingPricing.comingSoonLabel}</span>
                  ) : 'freeForever' in plan && plan.freeForever ? (
                    <span className="plan__price-forever">{landingPricing.freeForeverLabel}</span>
                  ) : (
                    <>
                      <span className="plan__price-old">
                        {'price' in plan ? plan.price : ''}
                        <span>{'period' in plan ? plan.period : ''}</span>
                      </span>
                      <span className="plan__price-now">{landingPricing.testLabel}</span>
                    </>
                  )}
                </div>
                <p className="plan__desc">{plan.desc}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <span className="tick">
                        <Icon icon="confirm" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                {!('comingSoon' in plan && plan.comingSoon) ? (
                  <Link
                    className={`btn btn--${'ctaVariant' in plan ? plan.ctaVariant : 'ghost'} btn--block`}
                    to="/register"
                  >
                    {'cta' in plan ? plan.cta : 'Начать'}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="wrap">
          <div className="cta__box reveal">
            <span className="cta__deco cta__deco--1" />
            <span className="cta__deco cta__deco--2" />
            <h2>Сосредоточьтесь на занятиях, а не на таблицах</h2>
            <p>
              LeO возьмёт на себя расписание, оплаты и балансы учеников. Попробуйте бесплатно — без
              карты.
            </p>
            <Link className="btn btn--white btn--lg" to="/login">
              Открыть расписание
            </Link>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot__in">
          <a className="logo" href="#top">
            <LogoBrand variant="landing-nav" />
          </a>
          <nav className="foot__links">
            <a href="#features">Возможности</a>
            <a href="#balance">Баланс</a>
            <a href="#pricing">Цены</a>
            <Link to="/login">Войти</Link>
          </nav>
          <div className="foot__copy">© 2026 LeO. Сделано репетитором для репетиторов.</div>
        </div>
      </footer>
    </div>
  );
}
