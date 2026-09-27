/**
 * Guarded access to the shipped NAP domains.
 *
 * Two rules learned the hard way and encoded here so no napplet has to remember
 * them:
 *
 * 1. A domain can be **present but incomplete** — a runtime may inject
 *    `window.napplet.theme` without a `get`. Presence checks alone are not
 *    enough, so every call is wrapped.
 * 2. A missing optional domain is a **missing feature, never a broken app**.
 *    Each helper returns a null-ish value the caller can render around.
 */
import { common, link, outbox, resource, storage } from "@napplet/sdk";
import type { NostrFilter, RelayEventResult } from "@napplet/sdk";
import type { NapDomain } from "../domains.js";

declare global {
  interface Window {
    napplet?: Record<string, unknown>;
  }
}

/** True when the runtime injected this domain for the current load. */
export function has(domain: NapDomain): boolean {
  return Boolean(window.napplet?.[domain]);
}

/** Options an outbox read may carry (SPEC-allowed fields only). */
export interface ReadOptions {
  authors?: string[];
  relays?: string[];
  limit?: number;
  timeoutMs?: number;
}

/** One-shot outbox read. Never throws — failure comes back as `error`. */
export async function query(
  filters: NostrFilter | NostrFilter[],
  options: ReadOptions = {},
): Promise<{ events: RelayEventResult[]; error?: string }> {
  if (!has("outbox")) return { events: [], error: "outbox-unavailable" };
  try {
    const result = await outbox.query(filters, options);
    return { events: result.events ?? [], error: result.error };
  } catch (error: unknown) {
    return { events: [], error: error instanceof Error ? error.message : "read-failed" };
  }
}

/** Live outbox stream. Returns a close function, or null when unavailable. */
export function subscribe(
  filters: NostrFilter | NostrFilter[],
  options: ReadOptions,
  onEvent: (result: RelayEventResult) => void,
): (() => void) | null {
  if (!has("outbox")) return null;
  try {
    const sub = outbox.subscribe(filters, options);
    sub.on("event", onEvent);
    return () => sub.close();
  } catch {
    return null;
  }
}

/**
 * External bytes through NAP-RESOURCE. `bytes` rather than `bytesAsObjectURL`
 * because only the promise form surfaces the rejection `code`.
 */
export async function bytes(url: string): Promise<Blob | null> {
  if (!has("resource")) return null;
  try {
    return await resource.bytes(url);
  } catch {
    return null;
  }
}

/** Read a scoped storage key; null when storage is absent or unset. */
export async function read(key: string): Promise<string | null> {
  if (!has("storage")) return null;
  try {
    return await storage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a scoped storage key; false when storage is absent or over quota. */
export async function write(key: string, value: string): Promise<boolean> {
  if (!has("storage")) return false;
  try {
    await storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Hand an external URL to the shell. Never navigates on its own. */
export async function openLink(url: string): Promise<"opened" | "denied" | "unavailable"> {
  if (!has("link")) return "unavailable";
  try {
    const result = await link.open(url);
    return result.status === "opened" ? "opened" : "denied";
  } catch {
    return "denied";
  }
}

/** Profile metadata for a hex pubkey; null when `common` is absent. */
export async function profile(pubkey: string): Promise<Record<string, unknown> | null> {
  if (!has("common")) return null;
  try {
    const result = await common.getProfile(pubkey);
    return result.ok ? ((result.profile ?? null) as Record<string, unknown> | null) : null;
  } catch {
    return null;
  }
}
