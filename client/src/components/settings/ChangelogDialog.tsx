import { useEffect, useId, useRef } from 'react';
import { CHANGELOG } from '../../data/changelog';
import { APP_VERSION, formatDeployDate } from '../../constants/appVersion';

export function ChangelogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="changelog-layer" role="presentation">
      <button type="button" className="changelog-layer__scrim" aria-label="Закрыть" onClick={onClose} />
      <div
        className="changelog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="changelog__head">
          <h2 id={titleId} className="changelog__title">
            История обновлений
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="iconbtn changelog__close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="changelog__body">
          {CHANGELOG.map((release) => (
            <section
              key={release.version}
              className={
                'changelog__release' + (release.version === APP_VERSION ? ' changelog__release--current' : '')
              }
            >
              <div className="changelog__release-head">
                <h3 className="changelog__version">v{release.version}</h3>
                <time className="changelog__date" dateTime={release.date}>
                  {formatDeployDate(release.date)}
                </time>
                {release.version === APP_VERSION ? (
                  <span className="changelog__badge">Текущая</span>
                ) : null}
              </div>
              <div className="changelog__sections">
                {release.sections.map((section) => (
                  <div key={section.title} className="changelog__section">
                    <h4 className="changelog__section-title">{section.title}</h4>
                    <ul className="changelog__list">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
