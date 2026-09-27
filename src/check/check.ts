/**
 * Proof on the built file: what a shell and the Nappelin Hangar read from a napplet is
 * there, once, where they look, and says the same as its manifest.
 *
 * For a folder with index.html and .nip5a-manifest.json (a build's dist/):
 * - LF only: a CR byte means a CRLF checkout leaked into the artifact, and the sha256 a
 *   pin was taken from will not be rebuilt anywhere else.
 * - `<meta charset>`, `napplet-type` and `napplet-requires` each once, each ending inside
 *   the first 1024 bytes (the HTML prescan, and shells that read only the start).
 * - Every declared name is a NAP domain, an interim `x-…` domain or a host channel.
 * - The manifest's `d` tag is the type, its `path` tag for /index.html is the file's
 *   sha256, and its `requires` tags are the declared names minus the host channels.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { classify, HOST_CHANNELS, manifestRequires } from "../domains.js";

/** How far a shell reads for the charset and the napplet metas. */
export const HEAD_WINDOW = 1024;

export interface CheckOptions {
  /** The shell's host channels, meta only (default: the Nappelin Hangar's). */
  hostChannels?: readonly string[];
}

export interface CheckResult {
  /** The folder checked. */
  dir: string;
  ok: boolean;
  problems: string[];
  bytes: number;
  sha256: string | null;
  type: string | null;
  requires: string[];
}

interface Tag {
  attrs: Map<string, string>;
  start: number;
  end: number;
}

/** Every `<meta …>` tag with its attributes and its byte range. */
function metaTags(bytes: Buffer): Tag[] {
  const text = bytes.toString("latin1");
  const tags: Tag[] = [];
  for (const match of text.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = new Map<string, string>();
    for (const attr of (match[1] ?? "").matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs.set((attr[1] ?? "").toLowerCase(), attr[2] ?? attr[3] ?? attr[4] ?? "");
    }
    // latin1 keeps one character per byte, so the index is the byte offset.
    tags.push({ attrs, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return tags;
}

/** Check one built napplet folder. Never throws; every finding is a problem line. */
export function checkArtifact(dir: string, options: CheckOptions = {}): CheckResult {
  const hostChannels = options.hostChannels ?? HOST_CHANNELS;
  const result: CheckResult = { dir, ok: false, problems: [], bytes: 0, sha256: null, type: null, requires: [] };
  const problem = (text: string) => result.problems.push(text);
  const page = path.join(dir, "index.html");
  if (!existsSync(page) || !statSync(page).isFile()) {
    problem("no index.html");
    return result;
  }
  const bytes = readFileSync(page);
  result.bytes = bytes.length;
  result.sha256 = createHash("sha256").update(bytes).digest("hex");
  const crs = bytes.filter((byte) => byte === 13).length;
  if (crs > 0) problem(`${crs} CR bytes: build from an LF checkout (see .gitattributes)`);

  const tags = metaTags(bytes);
  const charset = tags.filter((tag) => tag.attrs.has("charset"));
  if (charset.length === 0) problem("no <meta charset>");
  else if ((charset[0]?.end ?? Infinity) > HEAD_WINDOW) problem(`<meta charset> ends at byte ${charset[0]?.end}, after the first ${HEAD_WINDOW}`);
  const named = (name: string): string | null => {
    const found = tags.filter((tag) => tag.attrs.get("name") === name);
    if (found.length !== 1) {
      problem(`${found.length} <meta name="${name}">, expected 1`);
      return found.length ? (found[0]?.attrs.get("content") ?? null) : null;
    }
    const [tag] = found;
    if (tag && tag.end > HEAD_WINDOW) problem(`<meta name="${name}"> ends at byte ${tag.end}, after the first ${HEAD_WINDOW}`);
    return tag?.attrs.get("content") ?? null;
  };
  result.type = named("napplet-type");
  const requiresMeta = named("napplet-requires");
  result.requires = (requiresMeta ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  const declared = classify(result.requires, hostChannels);
  if (declared.unknown.length) problem(`not a NAP domain, interim domain or host channel: ${declared.unknown.join(", ")}`);

  const sidecar = path.join(dir, ".nip5a-manifest.json");
  if (!existsSync(sidecar)) {
    problem("no .nip5a-manifest.json beside index.html");
  } else {
    let tagsOf: string[][] = [];
    try {
      const manifest = JSON.parse(readFileSync(sidecar, "utf8")) as { tags?: unknown };
      tagsOf = Array.isArray(manifest.tags) ? (manifest.tags as string[][]) : [];
    } catch {
      problem(".nip5a-manifest.json is not JSON");
    }
    const values = (name: string) => tagsOf.filter((tag) => tag[0] === name);
    const d = values("d")[0]?.[1] ?? null;
    if (d !== result.type) problem(`manifest d tag "${d}" is not the napplet-type "${result.type}"`);
    const pagePath = values("path").find((tag) => tag[1] === "/index.html");
    if (!pagePath) problem("manifest has no path tag for /index.html");
    else if (pagePath[2] !== result.sha256) problem(`manifest path hash ${pagePath[2]} is not the file's sha256 ${result.sha256}`);
    const listed = values("requires").map((tag) => tag[1] ?? "");
    const duplicates = listed.filter((name, index) => listed.indexOf(name) !== index);
    if (duplicates.length) problem(`manifest requires tags twice: ${[...new Set(duplicates)].join(", ")}`);
    const hostInManifest = listed.filter((name) => hostChannels.includes(name));
    if (hostInManifest.length) problem(`host channels in the manifest (meta only): ${hostInManifest.join(", ")}`);
    const expected = manifestRequires(result.requires, hostChannels).join(",");
    const actual = [...new Set(listed.filter((name) => !hostChannels.includes(name)))].sort().join(",");
    if (expected !== actual) problem(`manifest requires [${actual}] but the meta declares [${expected}] (host channels aside)`);
  }
  result.ok = result.problems.length === 0;
  return result;
}
