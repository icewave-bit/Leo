export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE_ISO = __BUILD_DATE__;

export function formatDeployDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
