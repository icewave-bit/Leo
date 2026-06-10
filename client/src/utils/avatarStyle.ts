import type { CSSProperties } from 'react';

export function avatarHueStyle(hue: number): CSSProperties {
  return { ['--avatar-hue' as string]: String(hue) };
}
