/**
 * The chart's light and dark looks, in Zestoxx's own colours. The chart canvas takes these through the library's options; the controls
 * around it take the same palette through the .zx-dark rules in app/globals.css. Pure: no chart library, no DOM.
 */
export type ThemeId = "light" | "dark";
export const THEME_IDS: ThemeId[] = ["light", "dark"];
export const isThemeId = (v: unknown): v is ThemeId => v === "light" || v === "dark";

export interface ThemePalette {
  /** the chart's own background (the page behind shows through in light) */
  background: string;
  text: string;
  /** secondary text */
  muted: string;
  grid: string;
  border: string;
  crosshair: string;
  crosshairLabel: string;
  /** panels, menus and fields around the chart */
  panel: string;
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  light: { background: "#ffffff", text: "#475569", muted: "#64748b", grid: "#eef2f7", border: "#e2e8f0", crosshair: "#758696", crosshairLabel: "#4c525e", panel: "#ffffff" },
  dark: { background: "#0e1626", text: "#c9d5e6", muted: "#8da0b8", grid: "#1a2538", border: "#26354d", crosshair: "#7d90ab", crosshairLabel: "#33465f", panel: "#152033" },
};

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
