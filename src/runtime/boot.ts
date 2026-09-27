/**
 * The four lines every napplet would otherwise repeat.
 *
 * Boot must never throw: a runtime that injects no domains at all still has to
 * get a rendered, explanatory surface rather than an uncaught error — that is a
 * conformance requirement, not a nicety.
 */
import type { NapDomain } from "../domains.js";
import { clear, el, mount } from "./dom.js";
import { has } from "./nap.js";
import { startTheme } from "./theme.js";

/** Options for {@link boot}. */
export interface BootOptions {
  /**
   * Domains without which this napplet genuinely cannot function: without one it shows a
   * notice instead of starting. The build's `requires` lists every domain the code asks
   * for, optional ones included; this is the smaller, hard part of it.
   */
  requires?: readonly NapDomain[];
  /** Rendered once the surface is ready. */
  render: (root: HTMLElement) => void | Promise<void>;
  /** Shown when a hard requirement is missing. */
  unavailable?: string;
}

function notice(title: string, body: string): HTMLElement {
  return el("div", { class: "notice" }, [
    el("h2", { class: "notice-title", text: title }),
    el("p", { class: "notice-body", text: body }),
  ]);
}

/** Start a napplet: theme first, then render, with every failure surfaced. */
export function boot(options: BootOptions): void {
  const root = mount();
  try {
    startTheme();
    const missing = (options.requires ?? []).filter((domain) => !has(domain));
    if (missing.length > 0) {
      clear(
        root,
        notice(
          "Not available in this shell",
          options.unavailable ??
            `This napplet needs ${missing.join(", ")}, which this runtime did not provide.`,
        ),
      );
      return;
    }
    void Promise.resolve(options.render(root)).catch((error: unknown) => {
      clear(root, notice("Failed to start", error instanceof Error ? error.message : "Unknown."));
    });
  } catch (error: unknown) {
    clear(root, notice("Failed to start", error instanceof Error ? error.message : "Unknown."));
  }
}
