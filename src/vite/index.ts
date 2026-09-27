/**
 * The build layer: one call that declares a napplet the same way in every repository.
 *
 *   import { napplet } from "@nappelin/napplet-kit/vite";
 *
 *   export default defineConfig({
 *     build: { modulePreload: false, assetsInlineLimit: 1024 * 1024 },
 *     plugins: [
 *       viteSingleFile(),
 *       ...napplet({
 *         nappletType: "palace-map",
 *         requires: ["link", "resource", "theme"],
 *         title: "…",
 *         description: "…",
 *         artifactMode: "single-file",
 *       }),
 *     ],
 *   });
 *
 * It closes the traps the baseline round (2026-09-25) found in one repository after
 * another:
 * 1. Where the metas land. They are written by a `pre` hook, behind <meta charset>, inside
 *    the first 1024 bytes. A hook in normal order runs after Vite has put the entry script
 *    into the head, and the single-file build then inlines the whole bundle there.
 * 2. Interim domains. `@napplet/vite-plugin` 0.14.1 keeps only NAP domains in the
 *    manifest's `requires` tags; interimRequires() adds the `x-…` ones after it wrote the
 *    file.
 * 3. Host channels go into the meta only, and a name that is none of the known kinds stops
 *    the build (see ../domains.ts).
 * 4. `napplet-kit check <dist>` proves all of it on the built file.
 *
 * A plugin that swaps the whole page in its own `pre` hook (as bearlett's entry plugins do)
 * must come before napplet() in the plugin list, or the metas are replaced with the page.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nip5aManifest, type Nip5aManifestOptions } from "@napplet/vite-plugin";
import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from "vite";
import { classify, HOST_CHANNELS } from "../domains.js";

export { HOST_CHANNELS, NAP_DOMAINS, classify, manifestRequires } from "../domains.js";

/** What napplet() takes: the manifest plugin's options, with `requires` as the full list. */
export interface NappletOptions extends Omit<Nip5aManifestOptions, "requires"> {
  /** Every domain the code asks the shell for, optional ones included. */
  requires: readonly string[];
  /** The shell's host channels, meta only (default: the Nappelin Hangar's). */
  hostChannels?: readonly string[];
  /**
   * Let the manifest plugin infer NAP domains from the source and report the ones
   * `requires` misses: "error" stops the build, "warn" only says so.
   */
  inferCheck?: "warn" | "error";
}

/** The declared names without blanks and duplicates, in the order given. */
function declaredList(requires: readonly string[]): string[] {
  return [...new Set(requires.map((name) => name.trim()).filter(Boolean))];
}

/** The manifest plugin, the metas and the interim tags, from one declaration. */
export function napplet(options: NappletOptions): Plugin[] {
  const { requires, hostChannels = HOST_CHANNELS, inferCheck, ...manifest } = options;
  const declared = classify(requires, hostChannels);
  if (declared.unknown.length > 0) {
    throw new Error(
      `[napplet-kit] ${manifest.nappletType}: ${declared.unknown.join(", ")} is neither a NAP domain, ` +
        `an interim x- domain nor a host channel (${hostChannels.join(", ")}). ` +
        "A custom shell object belongs in the README, not in requires.",
    );
  }
  const napRequires = inferCheck ? { explicit: declared.nap, infer: true, mode: inferCheck } : declared.nap;
  return [
    nip5aManifest({ ...manifest, requires: napRequires }),
    nappletMeta({ nappletType: manifest.nappletType, requires }),
    interimRequires({ requires: declared.interim }),
  ];
}

/** What nappletMeta() writes. */
export interface MetaOptions {
  nappletType: string;
  requires: readonly string[];
}

/** `<meta name="napplet-type">` and `<meta name="napplet-requires">`, behind the charset. */
export function nappletMeta({ nappletType, requires }: MetaOptions): Plugin {
  const tag = (name: string, content: string): HtmlTagDescriptor => ({
    tag: "meta",
    attrs: { name, content },
    injectTo: "head",
  });
  return {
    name: "napplet-kit:meta",
    transformIndexHtml: {
      // Before Vite adds the entry script: the metas stay in the first 1024 bytes.
      order: "pre",
      handler: () => [tag("napplet-type", nappletType), tag("napplet-requires", declaredList(requires).join(","))],
    },
  };
}

/** Adds interim `x-…` requires tags to the manifest the manifest plugin wrote. */
export function interimRequires({ requires }: { requires: readonly string[] }): Plugin {
  let outDir = "";
  return {
    name: "napplet-kit:interim-requires",
    apply: "build",
    configResolved(config: ResolvedConfig) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      // After the manifest plugin's own closeBundle has written the file.
      order: "post",
      sequential: true,
      async handler() {
        if (requires.length > 0) await addRequiresTags(path.join(outDir, ".nip5a-manifest.json"), requires);
      },
    },
  };
}

interface ManifestFile {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  id?: string;
  sig?: string;
  pubkey?: string;
  aggregateHash?: string;
}

/**
 * Add `requires` tags to a written manifest file, after the ones it has. A manifest the
 * manifest plugin signed with VITE_DEV_PRIVKEY_HEX is signed again with that key; without
 * the key a signed manifest is refused rather than left with a broken signature.
 */
export async function addRequiresTags(file: string, names: readonly string[]): Promise<void> {
  const manifest = JSON.parse(await readFile(file, "utf8")) as ManifestFile;
  const have = new Set(manifest.tags.filter((tag) => tag[0] === "requires").map((tag) => tag[1]));
  const missing = [...new Set(names)].filter((name) => !have.has(name)).sort();
  if (missing.length === 0) return;
  let at = manifest.tags.findLastIndex((tag) => tag[0] === "requires");
  if (at === -1) at = manifest.tags.findLastIndex((tag) => ["d", "path", "x", "config", "title", "description"].includes(tag[0] ?? ""));
  manifest.tags.splice(at + 1, 0, ...missing.map((name) => ["requires", name]));
  let written: ManifestFile = manifest;
  if (manifest.sig) {
    const key = process.env.VITE_DEV_PRIVKEY_HEX;
    if (!key) {
      throw new Error(
        `[napplet-kit] ${file} is signed, and adding requires tags would break the signature. ` +
          "Build it unsigned and sign it afterwards, or set VITE_DEV_PRIVKEY_HEX for this build.",
      );
    }
    const { finalizeEvent } = await import("nostr-tools/pure");
    const { hexToBytes } = await import("nostr-tools/utils");
    const signed = finalizeEvent(
      { kind: manifest.kind, created_at: manifest.created_at, tags: manifest.tags, content: manifest.content },
      hexToBytes(key),
    );
    written = { ...signed, aggregateHash: manifest.aggregateHash };
  }
  // The same layout the manifest plugin writes.
  await writeFile(file, JSON.stringify(written, null, 2));
}
