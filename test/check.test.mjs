import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkArtifact } from "../dist/check/check.js";

const CLI = fileURLToPath(new URL("../dist/check/cli.js", import.meta.url));
const sha = (text) => createHash("sha256").update(text).digest("hex");

function page({ charset = true, type = "demo", requires = "theme,x-nappelin-cue,table", before = "", twice = false } = {}) {
  const metas = `<meta name="napplet-type" content="${type}">\n<meta name="napplet-requires" content="${requires}">\n`;
  return `<!doctype html>\n<html>\n<head>\n${charset ? '<meta charset="utf-8">\n' : ""}${before}${metas}${twice ? metas : ""}<title>Demo</title>\n</head>\n<body><main id="app"></main></body>\n</html>\n`;
}

function manifestFor(html, { d = "demo", requires = ["theme", "x-nappelin-cue"], hash } = {}) {
  return { kind: 35129, created_at: 0, content: "", tags: [["d", d], ["path", "/index.html", hash ?? sha(html)], ...requires.map((name) => ["requires", name])] };
}

function napplet(t, html, manifest) {
  const dir = mkdtempSync(path.join(tmpdir(), "napplet-kit-check-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, "index.html"), html);
  if (manifest !== null) writeFileSync(path.join(dir, ".nip5a-manifest.json"), JSON.stringify(manifest ?? manifestFor(html)));
  return dir;
}

test("a napplet that says the same in its page and its manifest passes", (t) => {
  const html = page();
  const result = checkArtifact(napplet(t, html));
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(result.type, "demo");
  assert.deepEqual(result.requires, ["theme", "x-nappelin-cue", "table"]);
  assert.equal(result.sha256, sha(html));
});

test("every way a built napplet goes wrong is named", (t) => {
  const cases = [
    ["CR bytes", page().replaceAll("\n", "\r\n"), undefined, /CR bytes/],
    ["no charset", page({ charset: false }), undefined, /no <meta charset>/],
    ["metas behind the bundle", page({ before: `<script>${"x".repeat(1200)}</script>\n` }), undefined, /napplet-type"> ends at byte \d+, after the first 1024/],
    ["metas twice", page({ twice: true }), undefined, /2 <meta name="napplet-type">/],
    ["an unknown name", page({ requires: "theme,guild" }), undefined, /not a NAP domain, interim domain or host channel: guild/],
    ["no manifest", page(), null, /no \.nip5a-manifest\.json/],
    ["another d tag", page(), (html) => manifestFor(html, { d: "other" }), /manifest d tag "other"/],
    ["another hash", page(), (html) => manifestFor(html, { hash: "0".repeat(64) }), /manifest path hash 0{64} is not the file's sha256/],
    ["the interim domain missing", page(), (html) => manifestFor(html, { requires: ["theme"] }), /manifest requires \[theme\] but the meta declares \[theme,x-nappelin-cue\]/],
    ["a host channel in the manifest", page(), (html) => manifestFor(html, { requires: ["table", "theme", "x-nappelin-cue"] }), /host channels in the manifest \(meta only\): table/],
    ["a tag twice", page(), (html) => manifestFor(html, { requires: ["theme", "theme", "x-nappelin-cue"] }), /manifest requires tags twice: theme/],
  ];
  for (const [what, html, manifest, expected] of cases) {
    const result = checkArtifact(napplet(t, html, typeof manifest === "function" ? manifest(html) : manifest));
    assert.equal(result.ok, false, what);
    assert.match(result.problems.join("\n"), expected, `${what}: ${result.problems.join(" | ")}`);
  }
});

test("a shell with other host channels is checked against its own", (t) => {
  const html = page({ requires: "theme,x-nappelin-cue,stage" });
  assert.equal(checkArtifact(napplet(t, html)).ok, false, "stage is no Nappelin host channel");
  assert.equal(checkArtifact(napplet(t, html), { hostChannels: ["stage"] }).ok, true);
});

test("the command line says OK or FAIL per napplet and exits 0, 1 or 2", (t) => {
  const good = napplet(t, page());
  const bad = napplet(t, page({ charset: false }));
  const run = (...args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" }) };
    } catch (error) {
      return { code: error.status, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  };
  const ok = run("check", good, path.join(good, "index.html"));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /^OK {3}.* demo {2}\[theme,x-nappelin-cue,table\]/m);
  const failed = run("check", good, bad);
  assert.equal(failed.code, 1);
  assert.match(failed.out, /^FAIL .*\n {7}no <meta charset>/m);
  const json = JSON.parse(run("check", "--json", good).out);
  assert.equal(json[0].ok, true);
  assert.equal(run("check").code, 2);
  assert.equal(run("lint", good).code, 2);
  mkdirSync(path.join(good, "empty"));
  assert.match(run("check", path.join(good, "empty")).out, /no index\.html/);
});
