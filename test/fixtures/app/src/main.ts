// A napplet built on the kit's runtime layer, as test/vite.test.mjs builds it.
import "../../../../dist/styles.css";
import { boot, el, openLink } from "../../../../dist/index.js";

// Enough code that the inlined bundle would push late metas far past the first 1024 bytes.
const LINES = Array.from({ length: 400 }, (_, i) => `line ${i}: the kit keeps its metas in front`);

boot({
  render(root) {
    root.append(el("h1", { text: "Kit fixture" }));
    for (const line of LINES) root.append(el("p", { text: line }));
    root.append(el("button", { text: "Open", type: "button", on: { click: () => void openLink("https://nappelin.com") } }));
  },
});
