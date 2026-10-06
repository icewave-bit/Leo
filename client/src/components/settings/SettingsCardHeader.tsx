import { Icon, VACATION_ICON, type AppIconName } from '../Icon';

export const SETTINGS_CARD_ICONS = {
  theme: 'paint-drop',
  archive: 'folder',
  log: 'clipboard-list',
  replenish: 'clipboard',
  week: 'calendar',
  workdays: 'grid-3',
  academic: 'watch',
  taxes: 'document-report',
  telegram: 'account',
  development: 'lightbulb',
  personalGroups: 'clipboard-list',
  workingHours: 'watch',
  vacation: VACATION_ICON,
} as const satisfies Record<string, AppIconName>;

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
