/**
 * @nappelin/napplet-kit: the small shared surface a NIP-5D napplet stands on.
 *
 * A napplet is one self-contained index.html a shell loads into
 * `iframe sandbox="allow-scripts"` without `allow-same-origin`: an opaque origin and no
 * ambient authority. This runtime layer is deliberately thin, so a napplet is its own
 * logic rather than boilerplate. It uses shipped NAP domains only and nothing specific to
 * one shell, so a napplet built on it runs unchanged in any NIP-5D shell.
 *
 * It started as Palace of Culture's kit (`@600b/napplet-kit`, 2026-09); the build layer is
 * in `@nappelin/napplet-kit/vite`, the artifact check in `napplet-kit check`.
 */
export { el, button, clear, mount, type ElProps } from "./runtime/dom.js";
export { applyTheme, startTheme, FALLBACK_THEME, type Palette } from "./runtime/theme.js";
export { has, query, subscribe, bytes, read, write, openLink, profile, type ReadOptions } from "./runtime/nap.js";
export { boot, type BootOptions } from "./runtime/boot.js";
export { relative, truncate, initials } from "./runtime/format.js";
export { NAP_DOMAINS, HOST_CHANNELS, classify, isNapDomain, isInterimDomain, type NapDomain } from "./domains.js";
