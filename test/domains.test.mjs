import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { classify, HOST_CHANNELS, isInterimDomain, manifestRequires, NAP_DOMAINS } from "../dist/domains.js";

test("the NAP domain list is the one the installed @napplet/vite-plugin keeps", () => {
  // The plugin exports only an ESM entry, so it is found the way an import finds it.
  const source = readFileSync(fileURLToPath(import.meta.resolve("@napplet/vite-plugin")), "utf8");
  const block = /var NAP_DOMAINS = \[([^\]]*)\]/.exec(source);
  assert.ok(block, "the plugin still has a NAP_DOMAINS list");
  const theirs = [...block[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...NAP_DOMAINS].sort(), theirs.sort(), "update src/domains.ts with the plugin");
});

test("and the one @napplet/core exports, which the conformance checks read", async () => {
  const { NAP_DOMAINS: core } = await import("@napplet/core");
  assert.deepEqual([...NAP_DOMAINS].sort(), [...core].sort());
});

test("a requires list sorts into NAP, interim, host channel and unknown, in the order given", () => {
  const declared = classify(["theme", " link ", "x-nappelin-cue", "table", "guild", "link", "", "resource"]);
  assert.deepEqual(declared, {
    nap: ["theme", "link", "resource"],
    interim: ["x-nappelin-cue"],
    host: ["table"],
    unknown: ["guild"],
  });
  assert.deepEqual(HOST_CHANNELS, ["table", "totem", "leitstand"]);
  assert.deepEqual(classify(["table"], []).unknown, ["table"], "a shell without host channels knows no table");
});

test("the manifest carries NAP and interim domains, sorted, never a host channel", () => {
  assert.deepEqual(manifestRequires(["theme", "table", "x-nappelin-cue", "identity", "leitstand"]), ["identity", "theme", "x-nappelin-cue"]);
  assert.ok(isInterimDomain("x-nappelin-cue"));
  for (const name of ["x-", "x-Cue", "xnappelin", "x-a--b", "table"]) assert.ok(!isInterimDomain(name), name);
});
