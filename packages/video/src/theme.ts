// Brand truth lives in @oio/tokens (packages/tokens/tokens.json) — the single
// source both this video project and @oio/social-card read from. Do not
// reintroduce a local tokens.json copy; that drift is exactly what the shared
// package exists to prevent.
import tokens from "@oio/tokens/tokens.json";

export type ColorRamp = { 100: string; 300: string; 500: string; 700: string; 900: string };

export const theme = tokens;

export const color = tokens.color;
export const type = tokens.type;
export const cornerLabel = tokens.cornerLabel;
export const frame = tokens.frame;
export const social = tokens.social;
export const shape = tokens.shape;
export const caption = tokens.caption;

export const fontStack = (name: keyof typeof tokens.type.fonts) =>
  tokens.type.fonts[name].stack.join(", ");

export const withAlpha = (hex: string, alpha: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
