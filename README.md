# @nappelin/napplet-kit

One way to build [NIP-5D](https://github.com/nostr-protocol/nips/pull/2303) napplets so
that every napplet runs in any shell, and the build says so. Two layers and a check:

- **Runtime** (`@nappelin/napplet-kit`): guarded access to the NAP domains, `boot()`,
  theme following, text-only DOM builders and a small stylesheet.
- **Build** (`@nappelin/napplet-kit/vite`): one `napplet()` call for Vite that writes the
  `napplet-type` and `napplet-requires` metas where shells look for them, and a manifest
  whose `requires` tags follow the rule below.
- **Check** (`napplet-kit check <dist>`): proof on the built file.

It grew out of the Nappelin consolidation (2026-09): nine napplet repositories brought to
one baseline hit the same four traps, and the Palace of Culture kit
(`@600b/napplet-kit`) had the cleanest runtime layer. This package is both.

## The requires rule

A shell grants a napplet only the domains it declares, so `requires` lists **every
domain the code asks the shell for, optional ones included**; the napplet degrades when
a shell refuses one (`boot({ requires })` names the few it cannot run without).

| Kind of name | `napplet-requires` meta | manifest `requires` tags |
|---|---|---|
| NAP domain (`outbox`, `resource`, `theme`, …) | yes | yes |
| Interim domain (`x-nappelin-cue`, any `x-…`) | yes | yes |
| Host channel of the Nappelin Hangar (`table`, `totem`, `leitstand`) | yes | no: another shell would read an unknown requirement |
| Custom shell object (`window.napplet.guild`, `zap`, `palace.*`) | no | no: document it in your README |

`napplet()` stops the build for a name that is none of these.

## Build

```ts
// vite.config.ts
import { napplet } from "@nappelin/napplet-kit/vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  build: {
    modulePreload: false, // its polyfill calls fetch, forbidden in the sandbox
    assetsInlineLimit: 1024 * 1024,
  },
  plugins: [
    viteSingleFile(),
    ...napplet({
      nappletType: "palace-map",
      requires: ["link", "resource", "theme"],
      title: "…",
      description: "…",
      artifactMode: "single-file",
    }),
  ],
});
```

`napplet()` takes every option of `nip5aManifest()` from `@napplet/vite-plugin` 0.14, with
`requires` as the full list, plus `hostChannels` (default: the Nappelin Hangar's) and
`inferCheck: "warn" | "error"` (let the manifest plugin report NAP domains the source uses
that `requires` misses). It returns three plugins, also exported on their own:

1. `nip5aManifest()` with the NAP domains.
2. `nappletMeta()`: both metas from a **`pre`** hook, so they sit behind `<meta charset>`
   inside the first 1024 bytes. A hook in normal order runs after Vite has put the entry
   script into the head, and the single-file build then inlines the whole bundle there,
   hundreds of kilobytes in front of the metas. A plugin that swaps the page in its own
   `pre` hook must come before `napplet()`.
3. `interimRequires()`: `@napplet/vite-plugin` 0.14.1 keeps only NAP domains in the
   manifest; this adds the `x-…` ones after it wrote the file. A manifest the plugin signed
   with `VITE_DEV_PRIVKEY_HEX` is signed again with that key; without the key a signed
   manifest is refused rather than left with a broken signature.

## Check

```sh
npx napplet-kit check dist            # or several folders; --json; --host-channels a,b
```

For each folder with `index.html` and `.nip5a-manifest.json` it checks:

- LF only;
- `<meta charset>`, `napplet-type` and `napplet-requires` each once, each ending inside
  the first 1024 bytes;
- every declared name of a known kind;
- the manifest's `d` tag equals the type, its `path` hash equals the file's sha256, and its
  `requires` tags equal the declared names minus the host channels.

It exits 1 when a napplet fails. It works for any build, not only Vite (the 600B TCG
builds its napplet with its own inliner).

Pins are sha256 hashes of the built bytes, and Git for Windows checks text out with CRLF.
Keep every napplet repository LF:

```gitattributes
* text=auto eol=lf
```

## Runtime

```ts
import "@nappelin/napplet-kit/styles.css";
import { boot, el, openLink, query } from "@nappelin/napplet-kit";

boot({
  requires: ["outbox"], // cannot run without it; the build's list has the optional ones too
  async render(root) {
    const { events } = await query({ kinds: [1], limit: 20 });
    for (const { event } of events) root.append(el("p", { text: event.content }));
  },
});
```

- `has(domain)`: whether the shell injected a domain for this load.
- `query`, `subscribe`, `bytes`, `read`, `write`, `openLink`, `profile`: each guarded; a
  missing optional domain is a missing feature, never a thrown error.
- `boot({ requires, render, unavailable })`: theme first, then render. A missing hard
  requirement or a failing render becomes a notice, never an uncaught error.
- `startTheme()`, `applyTheme()`, `FALLBACK_THEME`: NAP-THEME's three colours become
  `--p-*` tokens across the whole surface.
- `el`, `button`, `clear`, `mount`: every text goes through `textContent`.
- `relative`, `truncate`, `initials`.
- `styles.css`: the tokens, 44 px touch targets, a page view and a pager.

### From @600b/napplet-kit

The runtime API is the same. `has()` and `boot({ requires })` now take any NAP domain,
and the build helper replaces a repository's own meta plugin. Swap the import names and
the dependency.

## Develop

```sh
npm install
npm test        # builds, then node --test: domains, check, and real Vite builds
```

Publishing is for the maintainers of the `@nappelin` npm organisation: `npm publish`
(the tests run first; the package is public).

## License

MIT
