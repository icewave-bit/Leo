import { COLOR_PRESETS } from '../constants/colorPresets';

const DEFAULT_HUE = 250;

function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, '');
  const normalized =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** OKLCH hue (0–360) for schedule tints; achromatic colors fall back to DEFAULT_HUE. */
export function hexToOklchHue(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_HUE;

  const [r, g, b] = rgb.map(srgbToLinear);
  const l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bLab = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, bLab);
  if (chroma < 0.02) return DEFAULT_HUE;

  const hue = Math.atan2(bLab, a) * (180 / Math.PI);
  return ((hue % 360) + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function oklchToHex(l: number, c: number, h: number): string {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bRgb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const toByte = (v: number) =>
    Math.round(Math.min(255, Math.max(0, linearToSrgb(v) * 255)));
  const rr = toByte(r);
  const gg = toByte(g);
  const bb = toByte(bRgb);
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

/** Hue 0–360 stored on students → hex for the palette chip. */
export function hexFromHue(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  for (const preset of COLOR_PRESETS) {
    if (angleDiff(hexToOklchHue(preset), h) < 5) return preset;
  }
  return oklchToHex(0.62, 0.18, h);
}

/** Hex from palette → hue 0–360 for student API. */
export function hueFromHex(hex: string): number {
  return Math.round(hexToOklchHue(hex));
}
