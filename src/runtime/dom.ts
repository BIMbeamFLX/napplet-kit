/**
 * DOM builders.
 *
 * Every text value goes through `textContent`, never `innerHTML` — napplet
 * content comes off relays, and a napplet that interpolates HTML is one bad
 * event away from executing it.
 */

/** Declarative properties accepted by {@link el}. */
export interface ElProps {
  class?: string;
  text?: string;
  title?: string;
  type?: string;
  attrs?: Record<string, string>;
  data?: Record<string, string>;
  on?: Record<string, (event: Event) => void>;
}

/** Create an element with classes, text, attributes and listeners. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) node.title = props.title;
  if (props.type && "type" in node) (node as HTMLInputElement).type = props.type;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  for (const [k, v] of Object.entries(props.data ?? {})) node.dataset[k] = v;
  for (const [k, v] of Object.entries(props.on ?? {})) node.addEventListener(k, v);
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** A `<button type="button">` with a click handler. */
export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  return el("button", { class: className, text: label, type: "button", on: { click: onClick } });
}

/** Replace every child of `host`. */
export function clear(host: HTMLElement, ...children: (Node | string)[]): void {
  host.replaceChildren(...children);
}

/** The napplet's root element, created if the document has none. */
export function mount(id = "app"): HTMLElement {
  const existing = document.getElementById(id);
  if (existing) return existing;
  const root = el("main", { attrs: { id } });
  document.body.append(root);
  return root;
}
