import { Icon } from '../Icon';

/** Stroke paths (24×24), same style as AppShell nav icons. */
export const SETTINGS_CARD_ICONS = {
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  replenish: 'M3 7h18v10H3zM3 10h18M7 14h3',
  week: 'M7 2v3M17 2v3M3 8h18M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  academic: 'M12 6v6l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  taxes: 'M4 4h16v4H4zM4 10h10v10H4zM16 10h4v4h-4v6h-4',
  development: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z',
} as const;

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
        <Icon d={icon} size={22} />
      </span>
      <h2 className="settings-card__title">{title}</h2>
    </header>
  );
}
