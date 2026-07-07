import { Icon } from '../Icon';
import type { LineMdIconName } from '../../icons/lineMd';

export const SETTINGS_CARD_ICONS = {
  theme: 'paint-drop',
  archive: 'folder',
  replenish: 'clipboard',
  week: 'calendar',
  workdays: 'grid-3',
  academic: 'watch',
  taxes: 'document-report',
  development: 'lightbulb',
  personalGroups: 'clipboard-list',
  workingHours: 'watch',
} as const satisfies Record<string, LineMdIconName>;

export function SettingsCardHeader({
  icon,
  title,
  muted,
}: {
  icon: (typeof SETTINGS_CARD_ICONS)[keyof typeof SETTINGS_CARD_ICONS];
  title: string;
  muted?: boolean;
}) {
  return (
    <header className="settings-card__head">
      <span
        className={'settings-card__icon' + (muted ? ' settings-card__icon--muted' : '')}
        aria-hidden="true"
      >
        <Icon icon={icon} size={22} />
      </span>
      <h2 className="settings-card__title">{title}</h2>
    </header>
  );
}
