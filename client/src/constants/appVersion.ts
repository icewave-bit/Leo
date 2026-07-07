import { CHANGELOG } from '../data/changelog';

export const APP_VERSION = __APP_VERSION__;

/** Дата релиза текущей версии из changelog (не время сборки). */
export const RELEASE_DATE_ISO =
  CHANGELOG.find((release) => release.version === APP_VERSION)?.date ?? CHANGELOG[0]!.date;

export function formatDeployDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
