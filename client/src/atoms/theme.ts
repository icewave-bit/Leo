import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

function readSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const themeAtom = atomWithStorage<ThemePreference>('leo-theme', 'auto');

/** Updated when the OS color scheme changes (used when preference is auto). */
export const systemDarkAtom = atom(readSystemDark());

export const resolvedThemeAtom = atom<ResolvedTheme>((get) => {
  const preference = get(themeAtom);
  if (preference === 'light' || preference === 'dark') return preference;
  return get(systemDarkAtom) ? 'dark' : 'light';
});
