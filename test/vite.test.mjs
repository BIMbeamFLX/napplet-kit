import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { finalizeEvent, generateSecretKey, verifyEvent } from "nostr-tools/pure";
import { bytesToHex } from "nostr-tools/utils";
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { checkArtifact } from "../dist/check/check.js";
import { addRequiresTags, napplet } from "../dist/vite/index.js";

const ROOT = fileURLToPath(new URL("./fixtures/app/", import.meta.url));
const REQUIRES = ["theme", "link", "x-nappelin-cue", "table"];

async function buildFixture(t, options = {}) {
  const outDir = mkdtempSync(path.join(tmpdir(), "napplet-kit-build-"));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  await build({
    root: ROOT,
    configFile: false,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true, modulePreload: false, assetsInlineLimit: 1024 * 1024 },
    plugins: [
      viteSingleFile(),
      ...napplet({
        nappletType: "kit-fixture",
        requires: REQUIRES,
        title: "Kit fixture",
        description: "A napplet the kit builds in its own tests.",
        artifactMode: "single-file",
        ...options,
      }),
    ],
  });
  const html = readFileSync(path.join(outDir, "index.html"));
  const manifest = JSON.parse(readFileSync(path.join(outDir, ".nip5a-manifest.json"), "utf8"));
  return { outDir, html, manifest };
}

test("a single-file build carries both metas behind the charset, inside the first 1024 bytes", async (t) => {
  const { outDir, html } = await buildFixture(t);
  const text = html.toString("latin1");
  const at = (needle) => text.indexOf(needle);
  const charset = at("<meta charset");
  const type = at('<meta name="napplet-type" content="kit-fixture">');
  const requires = at('<meta name="napplet-requires" content="theme,link,x-nappelin-cue,table">');
  const script = at("<script");
  assert.ok(charset >= 0 && type > charset && requires > type, `charset ${charset}, type ${type}, requires ${requires}`);
  assert.ok(requires + 80 < 1024, `the requires meta at ${requires} ends inside the first 1024 bytes`);
  assert.ok(script > requires, "the inlined bundle comes after the metas");
  assert.ok(html.length > 4 * 1024, `${html.length} bytes: big enough that late metas would miss the window`);
  const result = checkArtifact(outDir);
  assert.deepEqual(result.problems, []);
});

test("the manifest lists the NAP and interim domains and leaves the host channel out", async (t) => {
  const { manifest } = await buildFixture(t);
  const requires = manifest.tags.filter((tag) => tag[0] === "requires").map((tag) => tag[1]);
  assert.deepEqual(requires, ["link", "theme", "x-nappelin-cue"]);
  assert.equal(manifest.tags.find((tag) => tag[0] === "d")[1], "kit-fixture");
  assert.equal(manifest.sig, undefined, "unsigned without a key");
});

test("a build signed with the dev key is signed again after the interim tags are added", async (t) => {
  const key = bytesToHex(generateSecretKey());
  process.env.VITE_DEV_PRIVKEY_HEX = key;
  t.after(() => delete process.env.VITE_DEV_PRIVKEY_HEX);
  const { outDir, manifest } = await buildFixture(t);
  assert.ok(manifest.sig, "the manifest plugin signed it");
  assert.ok(verifyEvent(manifest), "the signature holds over the added tags");
  assert.ok(manifest.tags.some((tag) => tag[0] === "requires" && tag[1] === "x-nappelin-cue"));
  assert.equal(checkArtifact(outDir).ok, true);

  delete process.env.VITE_DEV_PRIVKEY_HEX;
  const file = path.join(outDir, ".nip5a-manifest.json");
  const signed = finalizeEvent({ kind: 35129, created_at: 0, tags: [["d", "x"]], content: "" }, generateSecretKey());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(file, JSON.stringify(signed));
  await assert.rejects(addRequiresTags(file, ["x-nappelin-cue"]), /is signed, and adding requires tags would break the signature/);
});

test("the same metas from a hook in normal order land behind the bundle, and check says so", async (t) => {
  const { nip5aManifest } = await import("@napplet/vite-plugin");
  const outDir = mkdtempSync(path.join(tmpdir(), "napplet-kit-late-"));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  const late = {
    name: "late-metas",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { name: "napplet-type", content: "kit-fixture" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "napplet-requires", content: "theme,link" }, injectTo: "head" },
    ],
  };
  await build({
    root: ROOT,
    configFile: false,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true, modulePreload: false, assetsInlineLimit: 1024 * 1024 },
    plugins: [viteSingleFile(), late, nip5aManifest({ nappletType: "kit-fixture", requires: ["theme", "link"], artifactMode: "single-file" })],
  });
  const result = checkArtifact(outDir);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /<meta name="napplet-type"> ends at byte \d+, after the first 1024/);
});

test("a name that is no domain and no host channel stops the build before it starts", () => {
  assert.throws(
    () => napplet({ nappletType: "kit-fixture", requires: ["theme", "guild"], artifactMode: "single-file" }),
    /guild is neither a NAP domain, an interim x- domain nor a host channel/,
  );
});
