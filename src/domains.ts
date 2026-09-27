/**
 * What kind of name a napplet declares, and where each kind goes (the requires rule of
 * the Nappelin consolidation, 2026-09-25):
 *
 * - A standard NAP domain goes into the `napplet-requires` meta and into the kind 35129
 *   manifest's `requires` tags.
 * - An interim domain (`x-…`, for example `x-nappelin-cue`) goes into both as well.
 * - A host channel of the Nappelin Hangar (`table`, `totem`, `leitstand`) goes into the
 *   meta only: another shell would read it as an unknown requirement.
 * - A custom shell object (`window.napplet.guild`, `zap`, `palace.*`) goes into neither;
 *   document it in the napplet's README.
 *
 * `requires` lists every domain the napplet asks the shell for, optional ones included:
 * a shell grants only what is declared, and the napplet degrades when one is refused.
 */

/**
 * The NAP domains `@napplet/vite-plugin` 0.14.1 keeps in a manifest (its `NAP_DOMAINS`,
 * which it does not export). test/domains.test.mjs compares this copy with the installed
 * plugin, so an upgrade that changes the list fails loudly.
 */
export const NAP_DOMAINS = [
  "relay", "identity", "storage", "inc", "theme", "keys", "media", "notify", "config", "resource", "cvm",
  "outbox", "upload", "intent", "ble", "webrtc", "link", "count", "lists", "serial", "fs", "common", "dm",
] as const;

export type NapDomain = (typeof NAP_DOMAINS)[number];

/** The Nappelin Hangar's host channels: in the meta, never a manifest tag. */
export const HOST_CHANNELS: readonly string[] = ["table", "totem", "leitstand"];

const NAP_SET = new Set<string>(NAP_DOMAINS);
const INTERIM = /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True for a standard NAP domain. */
export function isNapDomain(name: string): name is NapDomain {
  return NAP_SET.has(name);
}

/** True for an interim domain such as `x-nappelin-cue`. */
export function isInterimDomain(name: string): boolean {
  return INTERIM.test(name);
}

/** A declared list, sorted by where each name goes. */
export interface Declared {
  /** Standard NAP domains: meta and manifest. */
  nap: string[];
  /** Interim `x-…` domains: meta and manifest. */
  interim: string[];
  /** Host channels: meta only. */
  host: string[];
  /** Names that are none of these: an error, since no shell would grant them. */
  unknown: string[];
}

/** Sort a requires list by kind; duplicates and blanks are dropped, the order kept. */
export function classify(requires: readonly string[], hostChannels: readonly string[] = HOST_CHANNELS): Declared {
  const declared: Declared = { nap: [], interim: [], host: [], unknown: [] };
  const seen = new Set<string>();
  for (const raw of requires) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (isNapDomain(name)) declared.nap.push(name);
    else if (hostChannels.includes(name)) declared.host.push(name);
    else if (isInterimDomain(name)) declared.interim.push(name);
    else declared.unknown.push(name);
  }
  return declared;
}

/** The names a manifest carries for a declared list: NAP and interim domains, sorted. */
export function manifestRequires(requires: readonly string[], hostChannels: readonly string[] = HOST_CHANNELS): string[] {
  const { nap, interim } = classify(requires, hostChannels);
  return [...nap, ...interim].sort();
}
