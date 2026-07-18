import tokens from "../tokens.json";

export type ColorRamp = { 100: string; 300: string; 500: string; 700: string; 900: string };

export const theme = tokens;

export const color = tokens.color;
export const type = tokens.type;
export const cornerLabel = tokens.cornerLabel;
export const frame = tokens.frame;

export const fontStack = (name: keyof typeof tokens.type.fonts) =>
  tokens.type.fonts[name].stack.join(", ");

export const withAlpha = (hex: string, alpha: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
