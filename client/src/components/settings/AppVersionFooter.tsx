import { useState } from 'react';
import { APP_VERSION, RELEASE_DATE_ISO, formatDeployDate } from '../../constants/appVersion';
import { OrnamentalDivider } from '../OrnamentalDivider';
import { ChangelogDialog } from './ChangelogDialog';

export function AppVersionFooter() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <footer className="settings-version">
        <OrnamentalDivider className="settings-version__divider" />
        <button
          type="button"
          className="settings-version__btn"
          onClick={() => setOpen(true)}
          aria-label={`Версия ${APP_VERSION}, обновлено ${formatDeployDate(RELEASE_DATE_ISO)}. Открыть историю изменений`}
        >
          <span className="settings-version__name">LeO</span>
          <span className="settings-version__meta">
            v{APP_VERSION} · {formatDeployDate(RELEASE_DATE_ISO)}
          </span>
        </button>
      </footer>
      <ChangelogDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
