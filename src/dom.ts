export type Child = Node | string | number | boolean | null | undefined | Child[];

export type Attrs = {
  class?: string | null | false;
  style?: Partial<CSSStyleDeclaration>;
  [key: string]: unknown;
} | null;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    if (predicate()) return true;
    if (performance.now() > deadline) return false;
    await sleep(30);
  }
}

// Gemini enforces Trusted Types.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h(tag: string, attrs: Attrs, ...children: Child[]): HTMLElement;
export function h(tag: string, attrs: Attrs, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  const flat = children
    .flat(Infinity as 1)
    .filter((c): c is Node | string | number => c != null && c !== false && c !== true)
    .map((c) => (c instanceof Node ? c : String(c)));
  el.append(...flat);
  return el;
}

export function sheet(css: string): CSSStyleSheet {
  const s = new CSSStyleSheet();
  s.replaceSync(css);
  return s;
}

// Icon elements hold ligature text (e.g. "check") in their text nodes.
export function cleanText(el: Element | null, iconSelector: string): string {
  if (!el) return '';
  let out = '';
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) out += (child as Text).data;
      else if (child.nodeType === Node.ELEMENT_NODE && !(child as Element).matches(iconSelector)) walk(child);
    }
  };
  walk(el);
  return out.replace(/\s+/g, ' ').trim();
}

export function deepActiveElement(): HTMLElement | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el instanceof HTMLElement ? el : null;
}

export const at = (row: number, col: number): Partial<CSSStyleDeclaration> => ({
  gridRow: String(row),
  gridColumn: String(col),
});
