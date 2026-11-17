// ==UserScript==
// @name         Gemini Mendeleev
// @namespace    https://github.com/moraxyc/gemini-mendeleev
// @version      0.1.2
// @description  Replace Gemini's model picker with a periodic table of models
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/moraxyc/gemini-mendeleev/dist/gemini-mendeleev.user.js
// @updateURL    https://raw.githubusercontent.com/moraxyc/gemini-mendeleev/dist/gemini-mendeleev.user.js
// ==/UserScript==
"use strict";
(() => {
  // src/dom.ts
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(predicate, timeoutMs) {
    const deadline = performance.now() + timeoutMs;
    for (; ; ) {
      if (predicate()) return true;
      if (performance.now() > deadline) return false;
      await sleep(30);
    }
  }
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
      if (value == null || value === false) continue;
      if (key === "class") el.className = String(value);
      else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
      else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2), value);
      } else {
        el.setAttribute(key, value === true ? "" : String(value));
      }
    }
    const flat = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).map((c) => c instanceof Node ? c : String(c));
    el.append(...flat);
    return el;
  }
  function sheet(css) {
    const s = new CSSStyleSheet();
    s.replaceSync(css);
    return s;
  }
  function cleanText(el, iconSelector) {
    if (!el) return "";
    let out = "";
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) out += child.data;
        else if (child.nodeType === Node.ELEMENT_NODE && !child.matches(iconSelector)) walk(child);
      }
    };
    walk(el);
    return out.replace(/\s+/g, " ").trim();
  }
  function deepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el instanceof HTMLElement ? el : null;
  }
  var at = (row, col) => ({
    gridRow: String(row),
    gridColumn: String(col)
  });

  // src/elements.ts
  var SYMBOLS = "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(" ");
  var NAMES = "Hydrogen Helium Lithium Beryllium Boron Carbon Nitrogen Oxygen Fluorine Neon Sodium Magnesium Aluminium Silicon Phosphorus Sulfur Chlorine Argon Potassium Calcium Scandium Titanium Vanadium Chromium Manganese Iron Cobalt Nickel Copper Zinc Gallium Germanium Arsenic Selenium Bromine Krypton Rubidium Strontium Yttrium Zirconium Niobium Molybdenum Technetium Ruthenium Rhodium Palladium Silver Cadmium Indium Tin Antimony Tellurium Iodine Xenon Caesium Barium Lanthanum Cerium Praseodymium Neodymium Promethium Samarium Europium Gadolinium Terbium Dysprosium Holmium Erbium Thulium Ytterbium Lutetium Hafnium Tantalum Tungsten Rhenium Osmium Iridium Platinum Gold Mercury Thallium Lead Bismuth Polonium Astatine Radon Francium Radium Actinium Thorium Protactinium Uranium Neptunium Plutonium Americium Curium Berkelium Californium Einsteinium Fermium Mendelevium Nobelium Lawrencium Rutherfordium Dubnium Seaborgium Bohrium Hassium Meitnerium Darmstadtium Roentgenium Copernicium Nihonium Flerovium Moscovium Livermorium Tennessine Oganesson".split(" ");
  var Z_BY_NAME = new Map(NAMES.map((name, i) => [name.toLowerCase(), i + 1]));
  for (const [alias, z] of [
    ["aluminum", 13],
    ["cesium", 55],
    ["sulphur", 16]
  ]) {
    Z_BY_NAME.set(alias, z);
  }
  var ELEMENT_MODEL = /^(?:gemini\s+)?(\d+(?:\.\d+)*)\s+(\p{L}+)$/iu;
  function elementName(z) {
    return NAMES[z - 1] ?? "";
  }
  function elementSymbol(z) {
    return SYMBOLS[z - 1] ?? "";
  }
  function place(z) {
    if (z >= 57 && z <= 71) return { row: 10, col: z - 57 + 4 };
    if (z >= 89 && z <= 103) return { row: 11, col: z - 89 + 4 };
    const [period, group] = z === 1 ? [1, 1] : z === 2 ? [1, 18] : z <= 4 ? [2, z - 2] : z <= 10 ? [2, z + 8] : z <= 12 ? [3, z - 10] : z <= 18 ? [3, z] : z <= 36 ? [4, z - 18] : z <= 54 ? [5, z - 36] : z <= 56 ? [6, z - 54] : z <= 86 ? [6, z - 68] : z <= 88 ? [7, z - 86] : [7, z - 100];
    return { row: period + 1, col: group + 1 };
  }
  function classify(raw) {
    const match = ELEMENT_MODEL.exec(raw.name);
    const key = (match?.[2] ?? raw.modeId).toLowerCase();
    const z = Z_BY_NAME.get(key) ?? 0;
    const version = match?.[1] ?? "";
    const title = z ? ["Gemini", version, elementName(z)].filter(Boolean).join(" ") : raw.name;
    return { ...raw, z, version, title };
  }
  function elementInText(text) {
    for (const word of text.split(/[^\p{L}]+/u)) {
      const z = Z_BY_NAME.get(word.toLowerCase());
      if (z) return z;
    }
    return 0;
  }
  function matchActiveOption(options, primaryLabel) {
    const text = primaryLabel.toLowerCase();
    if (text) {
      const labels = (o) => [o.name, o.title, o.description, o.z ? elementName(o.z) : ""].filter(Boolean).map((s) => s.toLowerCase());
      const exact = options.find((o) => labels(o).includes(text));
      if (exact) return exact;
      const partial = options.filter((o) => text.includes(o.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
      if (partial) return partial;
    }
    return options.find((o) => o.selected) ?? null;
  }

  // src/gemini.ts
  var PICKER = [
    'button[data-test-id="bard-mode-menu-button"]',
    "bard-mode-switcher button.input-area-switch",
    'button[data-test-id="model-selector"]'
  ].join(", ");
  var MENU_ITEM = 'gem-menu-item, [role^="menuitem"]';
  var ICON = "mat-icon, .mat-icon, gem-icon, svg";
  var HIDDEN_ATTR = "data-gm-hidden";
  var STEALTH_ATTR = "data-gm-stealth";
  var queue = Promise.resolve();
  function exclusive(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {
    });
    return run;
  }
  var findPicker = () => document.querySelector(PICKER);
  function isPickerDisabled(picker) {
    if (!picker) return true;
    return "disabled" in picker && Boolean(picker.disabled) || picker.getAttribute("aria-disabled") === "true";
  }
  var allItems = () => Array.from(document.querySelectorAll(MENU_ITEM));
  function isModelItem(el) {
    if (el.getAttribute("data-test-id") === "mode-picker-sign-in-button") return false;
    return el.hasAttribute("data-mode-id") || (el.getAttribute("data-test-id") ?? "").startsWith("bard-mode-option") || Boolean(el.querySelector(".mode-title"));
  }
  var modelItems = () => allItems().filter(isModelItem);
  var thinkingRow = () => document.querySelector('[value="thinking_level"]');
  function isSelected(el) {
    return el.classList.contains("selected") || el.classList.contains("is-selected") || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true" || Boolean(el.querySelector('[fonticon="check"], [data-mat-icon-name="check"]'));
  }
  function isDisabled(el) {
    return el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled") || Boolean(el.querySelector('[fonticon="lock"], [data-mat-icon-name="lock"]'));
  }
  function readOption(el) {
    const label = cleanText(el.querySelector(".label"), ICON);
    const sublabel = cleanText(el.querySelector(".sublabel"), ICON);
    const name = sublabel || cleanText(el.querySelector(".mode-title"), ICON) || label || cleanText(el, ICON);
    const description = sublabel ? label : cleanText(el.querySelector(".mode-desc"), ICON);
    const modeId = el.getAttribute("data-mode-id") ?? "";
    return classify({
      id: modeId || name,
      modeId,
      name,
      description,
      selected: isSelected(el),
      disabled: isDisabled(el),
      // "upsell_*" modes open an upgrade prompt and cannot be selected.
      locked: modeId.startsWith("upsell_")
    });
  }
  function readOptions() {
    const seen = /* @__PURE__ */ new Set();
    return modelItems().map(readOption).filter((o) => o.name && !seen.has(o.id) && seen.add(o.id));
  }
  function levelItems(row) {
    const controlsId = row.getAttribute("aria-controls");
    const submenu = controlsId && document.getElementById(controlsId) || row;
    return Array.from(submenu.querySelectorAll(MENU_ITEM)).filter((el) => el !== row && !isModelItem(el));
  }
  async function openThinkingLevels(row) {
    if (row.getAttribute("aria-expanded") !== "true") {
      row.click();
      await waitFor(() => row.getAttribute("aria-expanded") === "true", 500);
    }
    await waitFor(() => levelItems(row).length > 0, 500);
    return levelItems(row);
  }
  var levelLabel = (el) => cleanText(el.querySelector(".label"), ICON) || cleanText(el, ICON);
  async function readThinking() {
    const row = thinkingRow();
    if (!row || isDisabled(row)) return null;
    const existing = levelItems(row);
    const items = existing.length ? existing : await openThinkingLevels(row);
    if (!items.length) return null;
    return items.map((el) => ({
      label: levelLabel(el),
      description: cleanText(el.querySelector(".sublabel"), ICON),
      selected: isSelected(el),
      disabled: isDisabled(el)
    }));
  }
  function isMenuOpen(picker) {
    const expanded = picker.getAttribute("aria-expanded");
    return expanded == null ? modelItems().length > 0 : expanded === "true";
  }
  function withNativeMenu(task) {
    return exclusive(async () => {
      const picker = findPicker();
      if (!picker) throw new Error("Gemini's model picker was not found");
      if (isPickerDisabled(picker)) throw new Error("The model picker is disabled right now");
      const focus = deepActiveElement();
      document.documentElement.setAttribute(STEALTH_ATTR, "");
      try {
        if (!isMenuOpen(picker)) picker.click();
        if (!await waitFor(() => modelItems().length > 0, 1500)) {
          throw new Error("Gemini's model menu did not open");
        }
        return await task();
      } finally {
        if (isMenuOpen(picker)) picker.click();
        await waitFor(() => modelItems().length === 0, 500);
        document.documentElement.removeAttribute(STEALTH_ATTR);
        if (focus?.isConnected) focus.focus({ preventScroll: true });
      }
    });
  }
  function nativeLabel() {
    const picker = findPicker();
    if (!picker) return { primary: "", secondary: "" };
    const secondary = cleanText(picker.querySelector(".picker-secondary-text"), ICON);
    const primary = cleanText(picker.querySelector(".picker-primary-text"), ICON) || cleanText(picker.querySelector('[data-test-id="logo-pill-label-container"]'), ICON) || cleanText(picker, ICON).replace(secondary, "").trim();
    return { primary, secondary };
  }
  async function readSnapshot() {
    return withNativeMenu(async () => ({
      options: readOptions(),
      thinking: await readThinking()
    }));
  }
  async function selectNativeModel(option) {
    await withNativeMenu(async () => {
      const item = modelItems().find((el) => readOption(el).id === option.id);
      if (!item) throw new Error(`${option.title} is no longer in Gemini's menu`);
      if (!isSelected(item)) {
        item.click();
        const picker = findPicker();
        await waitFor(() => (picker ? !isMenuOpen(picker) : true) || isSelected(item), 800);
      }
    });
  }
  async function selectNativeLevel(label) {
    await withNativeMenu(async () => {
      const row = thinkingRow();
      if (!row) throw new Error("This model has no thinking levels");
      const target = (await openThinkingLevels(row)).find((el) => levelLabel(el) === label);
      if (!target) throw new Error(`Thinking level "${label}" was not found`);
      if (!isSelected(target)) {
        target.click();
        await sleep(150);
      }
    });
  }

  // src/storage.ts
  var STORE_KEY = "gemini-mendeleev:models";
  function loadCachedOptions() {
    try {
      const cached = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      if (!Array.isArray(cached)) return [];
      return cached.map((o) => classify({ ...o, selected: false }));
    } catch {
      return [];
    }
  }
  function saveCachedOptions(options) {
    const stored = options.map(({ id, modeId, name, description, disabled, locked }) => ({
      id,
      modeId,
      name,
      description,
      disabled,
      locked
    }));
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch {
    }
  }

  // src/styles/doc.css
  var doc_default = "[data-gm-hidden] {\n  position: absolute !important;\n  width: 1px !important;\n  height: 1px !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow: hidden !important;\n  opacity: 0 !important;\n  pointer-events: none !important;\n}\n\nhtml[data-gm-stealth] gem-menu,\nhtml[data-gm-stealth] gem-popover,\nhtml[data-gm-stealth] .cdk-overlay-popover,\nhtml[data-gm-stealth] .cdk-overlay-container {\n  opacity: 0 !important;\n  pointer-events: none !important;\n  transition: none !important;\n}\n";

  // src/styles/panel.css
  var panel_default = `:host {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483000;
  display: block;
}

:host([hidden]) {
  display: none;
}

.panel {
  --bg: #1b1c1d;
  --line: #2e3033;
  --cell: #232427;
  --cell-line: #313236;
  --text: #e3e3e3;
  --dim: #9aa0a6;
  --faint: #5f6368;
  --released: #2b2c30;
  --released-line: #44464b;
  --active: #2d4a70;
  --active-line: #7aa2e3;
  --teal: #1d3a33;
  --teal-line: #5fc4a5;
  --card: #242528;
  --seg: #1b1c1d;
  --seg-on: #2b5248;
  --seg-on-text: #c4eede;
  --error: #f28b82;
  box-sizing: border-box;
  width: 100%;
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 22px 26px 16px;
  border: 1px solid var(--line);
  border-radius: 28px;
  background: var(--bg);
  color: var(--text);
  box-shadow: 0 24px 64px rgba(0, 0, 0, .45);
  font-family: 'Google Sans Text', 'Google Sans', Roboto, system-ui, sans-serif;
  animation: rise .18s ease-out;
}

.panel[data-theme="light"] {
  --bg: #f8fafd;
  --line: #dde3ea;
  --cell: #eef1f5;
  --cell-line: #e1e5ea;
  --text: #1f1f1f;
  --dim: #5f6368;
  --faint: #b0b5ba;
  --released: #ffffff;
  --released-line: #c4c7c5;
  --active: #d3e3fd;
  --active-line: #0b57d0;
  --teal: #d9f2ea;
  --teal-line: #148a6c;
  --card: #ffffff;
  --seg: #eef1f5;
  --seg-on: #c2e9dc;
  --seg-on-text: #0b4f3e;
  --error: #b3261e;
  box-shadow: 0 24px 64px rgba(60, 64, 67, .25);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel,
  .spin {
    animation: none;
  }
}

header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.spark {
  font-size: 22px;
  line-height: 1;
  background: linear-gradient(135deg, #8ab4f8, #c58af9);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

h2 {
  margin: 0;
  font-family: 'Google Sans', inherit;
  font-size: 19px;
  font-weight: 500;
}

.spin {
  margin-left: auto;
  width: 14px;
  height: 14px;
  border: 2px solid var(--faint);
  border-top-color: var(--active-line);
  border-radius: 50%;
  animation: spin .8s linear infinite;
  visibility: hidden;
}

.panel[data-busy] .spin {
  visibility: visible;
}

.table {
  --cell-h: 46px;
  display: grid;
  gap: 5px;
  min-width: 660px;
  grid-template-columns: 18px repeat(18, minmax(32px, 1fr));
  grid-template-rows: 16px repeat(7, var(--cell-h)) 12px repeat(2, var(--cell-h));
}

.gnum,
.pnum,
.series {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10.5px;
  color: var(--faint);
}

.series {
  justify-content: flex-end;
  padding-right: 4px;
}

.cell {
  all: unset;
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cell-line);
  border-radius: 8px;
  background: var(--cell);
  color: var(--dim);
  font-size: 17px;
  font-weight: 500;
}

.cell.soon {
  opacity: .55;
}

.cell.released {
  background: var(--released);
  border-color: var(--released-line);
  color: var(--text);
  cursor: pointer;
  transition: transform .12s, background-color .12s, border-color .12s;
}

.cell.released:hover {
  transform: translateY(-1px);
}

.cell.released:focus-visible {
  outline: 2px solid var(--active-line);
  outline-offset: 2px;
}

.cell.unavailable {
  opacity: .6;
  cursor: not-allowed;
}

.cell.active {
  background: var(--active);
  border-color: var(--active-line);
}

.cell.preview {
  border-color: var(--teal-line);
  box-shadow: 0 0 0 1px var(--teal-line);
}

.cell.preview:not(.active) {
  background: var(--teal);
}

.cell.placeholder {
  border-style: dashed;
  background: transparent;
  font-size: 9.5px;
  color: var(--faint);
}

.num {
  position: absolute;
  top: 3px;
  left: 5px;
  font-size: 9px;
  font-weight: 400;
  opacity: .75;
}

.dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.hero {
  grid-row: 3 / 5;
  grid-column: 4 / 9;
  align-self: center;
  padding-left: 6px;
}

.hero h3 {
  margin: 0 0 8px;
  font-family: 'Google Sans', inherit;
  font-size: 34px;
  font-weight: 400;
  letter-spacing: -.5px;
}

.legend {
  display: flex;
  gap: 16px;
  font-size: 12.5px;
  color: var(--dim);
}

.legend span::before {
  margin-right: 6px;
}

.legend .on::before {
  content: '●';
  color: var(--active-line);
}

.legend .off::before {
  content: '○';
}

.card-slot {
  grid-row: 2 / 5;
  grid-column: 9 / 14;
  z-index: 1;
  min-width: 0;
}

.card {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--card);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.tile {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--teal-line);
  border-radius: 8px;
  background: var(--teal);
  font-size: 20px;
  font-weight: 500;
}

.card-text {
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-desc,
.card-label,
.card-hint {
  font-size: 12.5px;
  color: var(--dim);
}

.card-desc {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seg {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--seg);
}

.seg button {
  all: unset;
  padding: 6px 4px;
  border-radius: 999px;
  text-align: center;
  font-size: 13px;
  color: var(--dim);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seg button:hover {
  color: var(--text);
}

.seg button:focus-visible {
  outline: 2px solid var(--teal-line);
}

.seg button.on {
  background: var(--seg-on);
  color: var(--seg-on-text);
}

.seg button:disabled {
  opacity: .5;
  cursor: default;
}

footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 12.5px;
  color: var(--dim);
}

footer .label {
  margin-right: 6px;
}

.chip {
  all: unset;
  padding: 6px 14px;
  border: 1px solid var(--released-line);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
}

.chip:hover {
  background: color-mix(in srgb, var(--text) 6%, transparent);
}

.chip:focus-visible {
  outline: 2px solid var(--active-line);
  outline-offset: 2px;
}

.chip.on {
  background: var(--active);
  border-color: var(--active-line);
}

.chip:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.status {
  margin-left: auto;
}

.status.error {
  color: var(--error);
}

.native {
  all: unset;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.native:focus-visible {
  outline: 2px solid var(--active-line);
}
`;

  // src/ui/panel.ts
  var PANEL_MAX_WIDTH = 1040;
  var VIEWPORT_MARGIN = 12;
  function isDark() {
    const body = document.body.classList;
    if (body.contains("dark-theme")) return true;
    if (body.contains("light-theme")) return false;
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function createPanel(handlers) {
    const host = document.createElement("gemini-mendeleev-panel");
    host.hidden = true;
    const root = host.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [sheet(panel_default)];
    const body = h("div", {
      class: "panel",
      role: "dialog",
      "aria-label": "Model periodic table",
      tabindex: "-1"
    });
    root.append(body);
    const cells = /* @__PURE__ */ new Map();
    let cardSlot = null;
    function layout() {
      const state2 = handlers.getState();
      const placed = /* @__PURE__ */ new Map();
      const others = [];
      for (const option of state2.options) {
        if (option.z && !placed.has(option.z)) placed.set(option.z, option);
        else others.push(option);
      }
      const active = handlers.getActiveOption();
      const preview = state2.options.find((o) => o.id === state2.previewId && o.z) ?? (active?.z ? active : placed.values().next().value) ?? null;
      return { placed, others, active, preview };
    }
    function buildCard({ active, preview }) {
      const state2 = handlers.getState();
      if (!preview) {
        const message = state2.busy ? "Reading Gemini models…" : "No element-named models found";
        return h("div", { class: "card" }, h("div", { class: "card-hint" }, message));
      }
      const isActive = Boolean(active && active.id === preview.id);
      let foot;
      if (preview.locked) foot = h("div", { class: "card-hint" }, "Requires an upgrade");
      else if (preview.disabled) foot = h("div", { class: "card-hint" }, "Not available right now");
      else if (!isActive) foot = h("div", { class: "card-hint" }, "Click the element to switch");
      else if (state2.thinking) {
        foot = [
          h("div", { class: "card-label", id: "gm-thinking" }, "Thinking level"),
          h(
            "div",
            { class: "seg", role: "radiogroup", "aria-labelledby": "gm-thinking" },
            state2.thinking.map(
              (level) => h(
                "button",
                {
                  type: "button",
                  role: "radio",
                  class: level.selected ? "on" : null,
                  "aria-checked": String(level.selected),
                  "data-key": `level:${level.label}`,
                  title: level.description || null,
                  disabled: level.disabled,
                  onclick: () => handlers.onChooseLevel(level.label)
                },
                level.label
              )
            )
          )
        ];
      } else {
        foot = h("div", { class: "card-hint" }, state2.loaded ? "Current model" : "Loading thinking levels…");
      }
      return h(
        "div",
        { class: "card" },
        h(
          "div",
          { class: "card-head" },
          h("div", { class: "tile" }, h("span", { class: "num" }, preview.z), elementSymbol(preview.z)),
          h(
            "div",
            { class: "card-text" },
            h("div", { class: "card-title", title: preview.title }, preview.title),
            preview.description && h("div", { class: "card-desc", title: preview.description }, preview.description)
          )
        ),
        foot
      );
    }
    function setPreview(id) {
      const state2 = handlers.getState();
      if (state2.previewId === id) return;
      handlers.onPreviewChange(id);
      const view = layout();
      for (const [optionId, cell] of cells) {
        cell.classList.toggle("preview", Boolean(view.preview && view.preview.id === optionId));
      }
      if (cardSlot) cardSlot.replaceChildren(buildCard(view));
    }
    function buildTable(view) {
      const { placed, active, preview } = view;
      cells.clear();
      const nodes = [];
      for (let g = 1; g <= 18; g++) nodes.push(h("div", { class: "gnum", style: at(1, g + 1) }, g));
      for (let p = 1; p <= 7; p++) nodes.push(h("div", { class: "pnum", style: at(p + 1, 1) }, p));
      nodes.push(
        h("div", { class: "series", style: at(10, 3) }, "Ln"),
        h("div", { class: "series", style: at(11, 3) }, "An"),
        h("div", { class: "cell placeholder", style: at(7, 4), "aria-hidden": "true" }, "57–71"),
        h("div", { class: "cell placeholder", style: at(8, 4), "aria-hidden": "true" }, "89–103")
      );
      for (let z = 1; z <= SYMBOLS.length; z++) {
        const { row, col } = place(z);
        const option = placed.get(z);
        const content = [h("span", { class: "num" }, z), elementSymbol(z)];
        if (!option) {
          nodes.push(
            h(
              "div",
              { class: "cell soon", style: at(row, col), title: `${elementName(z)} · coming soon`, "aria-hidden": "true" },
              content
            )
          );
          continue;
        }
        const isActive = Boolean(active && active.id === option.id);
        const unavailable = option.disabled || option.locked;
        const classes = [
          "cell",
          "released",
          isActive && "active",
          preview && preview.id === option.id && "preview",
          unavailable && "unavailable"
        ];
        const cell = h(
          "button",
          {
            type: "button",
            class: classes.filter(Boolean).join(" "),
            style: at(row, col),
            "data-key": `model:${option.id}`,
            "aria-pressed": String(isActive),
            "aria-disabled": unavailable ? "true" : null,
            "aria-label": [option.title, option.description].filter(Boolean).join(", "),
            onclick: () => handlers.onChooseModel(option),
            onpointerenter: () => setPreview(option.id),
            onfocus: () => setPreview(option.id)
          },
          content,
          h("span", { class: "dot", "aria-hidden": "true" })
        );
        cells.set(option.id, cell);
        nodes.push(cell);
      }
      const versions = [...placed.values()].map((o) => o.version).filter(Boolean);
      const version = active?.z && active.version || versions.sort((a, b) => parseFloat(b) - parseFloat(a))[0] || "";
      nodes.push(
        h(
          "div",
          { class: "hero" },
          h("h3", null, version ? `Gemini ${version}` : "Gemini"),
          h(
            "div",
            { class: "legend" },
            h("span", { class: "on" }, `${placed.size} released`),
            h("span", { class: "off" }, "Coming soon")
          )
        )
      );
      cardSlot = h("div", { class: "card-slot" }, buildCard(view));
      nodes.push(cardSlot);
      return h("div", { class: "table", onpointerleave: () => setPreview(null) }, nodes);
    }
    function buildFooter({ others, active }) {
      const state2 = handlers.getState();
      const status = state2.error ? h("span", { class: "status error", role: "alert" }, state2.error) : h("span", { class: "status" }, state2.busy && !state2.options.length ? "Reading Gemini models…" : "");
      return h(
        "footer",
        null,
        others.length > 0 && h("span", { class: "label" }, "Other models"),
        others.map(
          (option) => h(
            "button",
            {
              type: "button",
              class: active && active.id === option.id ? "chip on" : "chip",
              "data-key": `model:${option.id}`,
              "aria-pressed": String(Boolean(active && active.id === option.id)),
              title: option.description || null,
              disabled: option.disabled || option.locked,
              onclick: () => handlers.onChooseModel(option)
            },
            option.name
          )
        ),
        status,
        h("button", { type: "button", class: "native", onclick: handlers.onOpenNativeMenu }, "Gemini menu")
      );
    }
    function reflectBusy(busy) {
      body.toggleAttribute("data-busy", busy > 0);
      body.setAttribute("aria-busy", String(busy > 0));
    }
    function position(anchorHost) {
      if (!handlers.getState().open) return;
      const anchor = anchorHost.closest("input-area-v2, input-container, .input-area, fieldset") ?? anchorHost;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(PANEL_MAX_WIDTH, innerWidth - 2 * VIEWPORT_MARGIN);
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN),
        innerWidth - width - VIEWPORT_MARGIN
      );
      host.style.width = `${width}px`;
      host.style.left = `${left}px`;
      const height = host.offsetHeight;
      let top;
      if (rect.bottom + 8 + height <= innerHeight - VIEWPORT_MARGIN) top = rect.bottom + 8;
      else if (rect.top - 8 - height >= VIEWPORT_MARGIN) top = rect.top - 8 - height;
      else top = Math.max(VIEWPORT_MARGIN, innerHeight - VIEWPORT_MARGIN - height);
      host.style.top = `${top}px`;
    }
    function render(anchorHost) {
      const state2 = handlers.getState();
      if (!state2.open) return;
      const focused = root.activeElement;
      const focusKey = focused?.getAttribute("data-key");
      const view = layout();
      body.dataset.theme = isDark() ? "dark" : "light";
      body.replaceChildren(
        h(
          "header",
          null,
          h("span", { class: "spark", "aria-hidden": "true" }, "✦"),
          h("h2", null, "Model periodic table"),
          h("span", { class: "spin", "aria-hidden": "true" })
        ),
        buildTable(view),
        buildFooter(view)
      );
      reflectBusy(state2.busy);
      if (focusKey) {
        const again = Array.from(body.querySelectorAll("[data-key]")).find(
          (el) => el.getAttribute("data-key") === focusKey
        );
        again?.focus({ preventScroll: true });
      }
      position(anchorHost);
    }
    return {
      host,
      body,
      render,
      reflectBusy,
      position,
      focus: () => body.focus({ preventScroll: true })
    };
  }

  // src/styles/trigger.css
  var trigger_default = ':host {\n  display: inline-flex;\n  align-items: center;\n}\n\nbutton {\n  all: unset;\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  height: 40px;\n  padding: 0 12px 0 16px;\n  border-radius: 999px;\n  cursor: pointer;\n  font-family: inherit;\n  font-size: 15px;\n  font-weight: 500;\n  color: inherit;\n  white-space: nowrap;\n  transition: background-color .15s;\n}\n\nbutton:hover {\n  background: color-mix(in srgb, currentColor 8%, transparent);\n}\n\nbutton[aria-expanded="true"] {\n  background: color-mix(in srgb, currentColor 12%, transparent);\n}\n\nbutton:focus-visible {\n  outline: 2px solid #8ab4f8;\n  outline-offset: 2px;\n}\n\nbutton:disabled {\n  opacity: .5;\n  cursor: default;\n}\n\n.sub {\n  font-size: 13px;\n  font-weight: 400;\n  opacity: .65;\n}\n\n.sub:empty {\n  display: none;\n}\n\n.chev {\n  width: 7px;\n  height: 7px;\n  margin-left: 4px;\n  border-right: 1.6px solid;\n  border-bottom: 1.6px solid;\n  transform: translateY(-2px) rotate(45deg);\n  transition: transform .2s;\n}\n\nbutton[aria-expanded="true"] .chev {\n  transform: translateY(2px) rotate(-135deg);\n}\n';

  // src/ui/trigger.ts
  function createTrigger(handlers) {
    const host = document.createElement("gemini-mendeleev-trigger");
    const root = host.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [sheet(trigger_default)];
    const mainEl = h("span", { class: "main" });
    const subEl = h("span", { class: "sub" });
    const button = h(
      "button",
      {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        onclick: handlers.onToggle,
        onpointerenter: handlers.onPrefetch
      },
      mainEl,
      subEl,
      h("span", { class: "chev", "aria-hidden": "true" })
    );
    root.append(button);
    return {
      host,
      button,
      update({ main, sub, disabled, ariaLabel, open }) {
        if (mainEl.textContent !== main) mainEl.textContent = main;
        if (subEl.textContent !== sub) subEl.textContent = sub;
        button.disabled = disabled;
        button.setAttribute("aria-label", ariaLabel);
        button.setAttribute("aria-expanded", String(open));
      }
    };
  }

  // src/main.ts
  var state = {
    options: loadCachedOptions(),
    thinking: null,
    loaded: false,
    busy: 0,
    error: "",
    open: false,
    previewId: null,
    pendingId: null
  };
  function activeOption() {
    if (state.pendingId) return state.options.find((o) => o.id === state.pendingId) ?? null;
    return matchActiveOption(state.options, nativeLabel().primary);
  }
  var trigger = createTrigger({
    onToggle: () => state.open ? closePanel() : openPanel(),
    onPrefetch: () => {
      if (!state.loaded) void refresh();
    }
  });
  var panel = createPanel({
    getState: () => state,
    getActiveOption: activeOption,
    onChooseModel: (option) => void chooseModel(option),
    onChooseLevel: (label) => void chooseLevel(label),
    onOpenNativeMenu: openNativeMenu,
    onPreviewChange: (id) => {
      state.previewId = id;
    }
  });
  function updateTrigger() {
    const picker = findPicker();
    const { primary, secondary } = nativeLabel();
    const active = activeOption();
    const z = active ? active.z : elementInText(primary);
    const main = (z ? elementName(z) : active ? active.name : primary) || "Model";
    trigger.update({
      main,
      sub: secondary,
      disabled: isPickerDisabled(picker),
      ariaLabel: `Choose model, current: ${active ? active.title : primary}`,
      open: state.open
    });
  }
  async function snapshot() {
    const snap = await readSnapshot();
    state.options = snap.options;
    state.thinking = snap.thinking;
    state.loaded = true;
    saveCachedOptions(snap.options);
  }
  async function act(work) {
    state.busy++;
    panel.reflectBusy(state.busy);
    try {
      await work();
      state.error = "";
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      console.warn("[gemini-mendeleev]", err);
    } finally {
      state.busy--;
      state.pendingId = null;
      panel.reflectBusy(state.busy);
      updateTrigger();
      if (state.open) panel.render(trigger.host);
    }
  }
  var refreshing = null;
  function refresh() {
    refreshing ??= act(snapshot).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }
  function chooseModel(option) {
    if (option.disabled || option.locked || state.busy) return;
    state.pendingId = option.id;
    state.previewId = option.id;
    updateTrigger();
    panel.render(trigger.host);
    return act(async () => {
      await selectNativeModel(option);
      await snapshot();
    });
  }
  function chooseLevel(label) {
    if (state.busy) return;
    if (state.thinking) {
      state.thinking = state.thinking.map((l) => ({ ...l, selected: l.label === label }));
    }
    panel.render(trigger.host);
    return act(async () => {
      await selectNativeLevel(label);
      await snapshot();
    });
  }
  function openPanel() {
    if (state.open) return;
    state.open = true;
    state.previewId = null;
    if (!panel.host.isConnected) document.body.append(panel.host);
    panel.host.hidden = false;
    panel.render(trigger.host);
    updateTrigger();
    panel.focus();
    void refresh();
  }
  function closePanel({ restoreFocus = false } = {}) {
    if (!state.open) return;
    state.open = false;
    panel.host.hidden = true;
    updateTrigger();
    if (restoreFocus) trigger.button.focus({ preventScroll: true });
  }
  function openNativeMenu() {
    closePanel();
    findPicker()?.click();
  }
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!state.open) return;
      const path = event.composedPath();
      if (!path.includes(panel.host) && !path.includes(trigger.host)) closePanel();
    },
    true
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (state.open && event.key === "Escape") {
        event.stopPropagation();
        closePanel({ restoreFocus: true });
      }
    },
    true
  );
  addEventListener("resize", () => panel.position(trigger.host));
  function sync() {
    const picker = findPicker();
    if (!picker) {
      closePanel();
      return;
    }
    if (!picker.hasAttribute(HIDDEN_ATTR)) {
      picker.setAttribute(HIDDEN_ATTR, "");
      picker.setAttribute("tabindex", "-1");
      picker.setAttribute("aria-hidden", "true");
    }
    if (picker.previousElementSibling !== trigger.host) picker.before(trigger.host);
    updateTrigger();
  }
  var syncQueued = false;
  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      sync();
    });
  }
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet(doc_default)];
  new MutationObserver(scheduleSync).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "aria-disabled", "disabled"]
  });
  sync();
})();
