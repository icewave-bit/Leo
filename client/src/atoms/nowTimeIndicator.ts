import { atomWithStorage } from 'jotai/utils';

export type NowTimeLinePrefs = {
  enabled: boolean;
  /** 0..1 */
  opacity: number;
  /** Base thickness in pixels for non-today days. */
  thicknessPx: number;
  /** Multiplier applied to `thicknessPx` on the current day. */
  todayThicknessMultiplier: number;
  /** CSS color for the line (hex or other supported format). */
  color: string;
};

const DEFAULT_PREFS: NowTimeLinePrefs = {
  enabled: true,
  opacity: 0.7,
  thicknessPx: 1,
  todayThicknessMultiplier: 2.5,
  color: '#6366f1',
};

export const nowTimeLinePrefsAtom = atomWithStorage<NowTimeLinePrefs>(
  'leo-now-time-line-prefs-v2',
  DEFAULT_PREFS,
);
