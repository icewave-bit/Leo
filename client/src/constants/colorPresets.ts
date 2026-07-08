export const COLOR_PRESETS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#64748b',
  '#ef4444',
] as const;

export type ColorPreset = (typeof COLOR_PRESETS)[number];
