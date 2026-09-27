#!/usr/bin/env node
/**
 * napplet-kit check [--host-channels table,totem,leitstand] [--json] <dist folder or index.html>...
 *
 * Exits 1 when any napplet fails, 2 on a usage error. See check.ts for what is checked.
 */
import path from "node:path";
import { checkArtifact, type CheckResult } from "./check.js";

const USAGE = "usage: napplet-kit check [--host-channels a,b] [--json] <dist folder or index.html>...";

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command !== "check") {
    console.error(USAGE);
    return 2;
  }
  let hostChannels: string[] | undefined;
  let json = false;
  const targets: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? "";
    if (arg === "--json") json = true;
    else if (arg === "--host-channels" || arg.startsWith("--host-channels=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : (rest[(i += 1)] ?? "");
      hostChannels = value.split(",").map((name) => name.trim()).filter(Boolean);
    } else if (arg.startsWith("--")) {
      console.error(`unknown option ${arg}\n${USAGE}`);
      return 2;
    } else targets.push(arg);
  }
  if (targets.length === 0) {
    console.error(USAGE);
    return 2;
  }
  const results: CheckResult[] = targets.map((target) =>
    checkArtifact(path.basename(target) === "index.html" ? path.dirname(target) : target, { hostChannels }),
  );
  if (json) console.log(JSON.stringify(results, null, 2));
  else {
    for (const result of results) {
      console.log(`${result.ok ? "OK  " : "FAIL"} ${result.dir}  ${result.type ?? "?"}  [${result.requires.join(",")}]  ${result.bytes} B`);
      for (const problem of result.problems) console.log(`       ${problem}`);
    }
  }
  return results.every((result) => result.ok) ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
