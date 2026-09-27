/**
 * Whole-surface theming.
 *
 * NAP-THEME is optional and gives three colours. The rest are derived once, here,
 * so a napplet never ships a second palette. Applied to `:root`, `html`, `body`
 * and the app root — a napplet that only paints its widgets leaves a foreign
 * canvas around itself inside the host.
 */
import { themeGet, themeOnChanged } from "@napplet/sdk";
import { has } from "./nap.js";

/** The three colours a theme payload guarantees. */
export interface Palette {
  background: string;
  text: string;
  primary: string;
}

/** Used when the runtime offers no theme. Explicit, never browser-default. */
export const FALLBACK_THEME: Palette = {
  background: "#0a0705",
  text: "#efe6d2",
  primary: "#e7b23c",
};

function parseHex(color: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match?.[1]) return null;
  const hex = match[1];
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function mix(from: string, to: string, ratio: number): string | null {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return null;
  const c = a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * ratio));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Paint a palette across the whole surface. */
export function applyTheme(palette: Palette): void {
  const root = document.documentElement;
  const tokens: Record<string, string> = {
    "--p-bg": palette.background,
    "--p-fg": palette.text,
    "--p-primary": palette.primary,
    "--p-surface": mix(palette.background, palette.text, 0.07) ?? "rgba(127,127,127,.12)",
    "--p-line": mix(palette.background, palette.text, 0.2) ?? "rgba(127,127,127,.32)",
    "--p-muted": mix(palette.background, palette.text, 0.55) ?? "rgba(127,127,127,.85)",
  };
  for (const [token, value] of Object.entries(tokens)) root.style.setProperty(token, value);
  root.style.backgroundColor = palette.background;
  root.style.color = palette.text;
  if (document.body) {
    document.body.style.backgroundColor = palette.background;
    document.body.style.color = palette.text;
  }
}

function readPalette(payload: { colors?: Partial<Palette> } | null): Palette {
  const colors = payload?.colors;
  return {
    background: colors?.background || FALLBACK_THEME.background,
    text: colors?.text || FALLBACK_THEME.text,
    primary: colors?.primary || FALLBACK_THEME.primary,
  };
}

/** Apply the runtime theme and follow it. Safe when NAP-THEME is absent. */
export function startTheme(): void {
  applyTheme(FALLBACK_THEME);
  if (!has("theme")) return;
  // Guarded: a domain can be injected without implementing every helper.
  try {
    themeGet()
      .then((theme) => applyTheme(readPalette(theme)))
      .catch(() => applyTheme(FALLBACK_THEME));
  } catch {
    applyTheme(FALLBACK_THEME);
  }
  try {
    themeOnChanged((theme) => applyTheme(readPalette(theme)));
  } catch {
    /* no live updates from this runtime */
  }
}
