import { at, type Child, h, sheet } from '../dom.ts';
import {
  elementName,
  elementSymbol,
  FIRST_UNNAMED_Z,
  modelSymbol,
  place,
  SYMBOLS,
  systematicName,
  systematicSymbol,
} from '../elements.ts';
import panelCss from '../styles/panel.css';
import type { AppState, ModelOption, TableView } from '../types.ts';

const PANEL_MAX_WIDTH = 1040;
const VIEWPORT_MARGIN = 12;
const GROUPS = 18;

const cellSymbol = (z: number, option: ModelOption | undefined): string =>
  z < FIRST_UNNAMED_Z || !option ? elementSymbol(z) : modelSymbol(option.name);

export interface PanelHandlers {
  getState: () => AppState;
  getActiveOption: () => ModelOption | null;
  onChooseModel: (option: ModelOption) => void;
  onChooseLevel: (label: string) => void;
  onOpenNativeMenu: () => void;
  onPreviewChange: (id: string | null) => void;
}

export interface PanelView {
  host: HTMLElement;
  body: HTMLDivElement;
  render(anchorHost: HTMLElement): void;
  reflectBusy(busy: number): void;
  position(anchorHost: HTMLElement): void;
  focus(): void;
}

function isDark(): boolean {
  const body = document.body.classList;
  if (body.contains('dark-theme')) return true;
  if (body.contains('light-theme')) return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

export function createPanel(handlers: PanelHandlers): PanelView {
  const host = document.createElement('gemini-mendeleev-panel');
  host.hidden = true;
  const root = host.attachShadow({ mode: 'open' });
  root.adoptedStyleSheets = [sheet(panelCss)];

  const body = h('div', {
    class: 'panel',
    role: 'dialog',
    'aria-label': 'Model periodic table',
    tabindex: '-1',
  });
  root.append(body);

  const cells = new Map<string, HTMLButtonElement>();
  let previewSlot: HTMLDivElement | null = null;

  function layout(): TableView {
    const state = handlers.getState();
    const placed = new Map<number, ModelOption>();
    const unnamed: ModelOption[] = [];
    for (const option of state.options) {
      if (option.z && !placed.has(option.z)) placed.set(option.z, option);
      else unnamed.push(option);
    }
    unnamed.forEach((option, i) => placed.set(FIRST_UNNAMED_Z + i, option));
    const zById = new Map(Array.from(placed, ([z, option]) => [option.id, z]));
    const active = handlers.getActiveOption();
    const preview =
      state.options.find((o) => o.id === state.previewId) ?? active ?? placed.values().next().value ?? null;
    return { placed, zById, unnamedCount: unnamed.length, active, preview };
  }

  function buildCard({ active, preview, zById }: TableView): HTMLDivElement {
    const state = handlers.getState();
    if (!preview) {
      const message = state.busy ? 'Reading Gemini models…' : 'No models found';
      return h('div', { class: 'card' }, h('div', { class: 'card-hint' }, message));
    }
    previewSlot = h('div', { class: 'card-preview' }, buildPreview(active, preview, zById));
    return h('div', { class: 'card' }, previewSlot, buildThinking(active, preview));
  }

  // Thinking levels always belong to the active model, whatever is being previewed.
  function buildThinking(active: ModelOption | null, preview: ModelOption): Child {
    const state = handlers.getState();
    if (!active) return null;
    if (!state.thinking) {
      return state.loaded ? null : h('div', { class: 'card-hint' }, 'Loading thinking levels…');
    }
    return [
      h('div', { class: 'card-label', id: 'gm-thinking' }, thinkingLabel(active, preview)),
      h(
        'div',
        { class: 'seg', role: 'radiogroup', 'aria-labelledby': 'gm-thinking' },
        state.thinking.map((level) =>
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              class: level.selected ? 'on' : null,
              'aria-checked': String(level.selected),
              'data-key': `level:${level.label}`,
              title: level.description || null,
              disabled: level.disabled,
              onclick: () => handlers.onChooseLevel(level.label),
            },
            level.label,
          ),
        ),
      ),
    ];
  }

  function thinkingLabel(active: ModelOption, preview: ModelOption | null): string {
    if (!preview || active.id === preview.id) return 'Thinking level';
    return `Thinking level · ${active.z ? elementName(active.z) : active.name}`;
  }

  function buildPreview(active: ModelOption | null, preview: ModelOption, zById: Map<string, number>): HTMLDivElement {
    const isActive = Boolean(active && active.id === preview.id);
    let hint = '';
    if (preview.locked) hint = 'Requires an upgrade';
    else if (preview.disabled) hint = 'Not available right now';
    else if (!isActive) hint = 'Click to switch';
    const z = zById.get(preview.id) ?? 0;
    const provisional = z >= FIRST_UNNAMED_Z;
    return h(
      'div',
      { class: 'card-head' },
      h('div', { class: provisional ? 'tile provisional' : 'tile' }, h('span', { class: 'num' }, z), cellSymbol(z, preview)),
      h(
        'div',
        { class: 'card-text' },
        h('div', { class: 'card-title', title: preview.title }, preview.title),
        preview.description && h('div', { class: 'card-desc', title: preview.description }, preview.description),
        provisional &&
          h(
            'div',
            { class: 'card-desc', title: 'IUPAC placeholder name: this model has no element yet' },
            `${systematicSymbol(z)} · ${systematicName(z)}`,
          ),
        hint && h('div', { class: 'card-hint' }, hint),
      ),
    );
  }

  // Mutates classes and the card in place so the hovered cell stays mounted for click.
  function setPreview(id: string | null): void {
    const state = handlers.getState();
    if (state.previewId === id) return;
    handlers.onPreviewChange(id);
    const view = layout();
    for (const [optionId, cell] of cells) {
      cell.classList.toggle('preview', Boolean(view.preview && view.preview.id === optionId));
    }
    if (view.preview) previewSlot?.replaceChildren(buildPreview(view.active, view.preview, view.zById));
    const label = root.getElementById('gm-thinking');
    if (label && view.active) label.textContent = thinkingLabel(view.active, view.preview);
  }

  function buildTable(view: TableView): HTMLDivElement {
    const { placed, active, preview, unnamedCount } = view;
    cells.clear();
    const nodes: HTMLElement[] = [];
    const unnamedRows = Math.ceil(unnamedCount / GROUPS);
    for (let g = 1; g <= GROUPS; g++) nodes.push(h('div', { class: 'gnum', style: at(1, g + 1) }, g));
    for (let p = 1; p <= 7 + Math.min(unnamedRows, 1); p++) {
      nodes.push(h('div', { class: 'pnum', style: at(p + 1, 1) }, p));
    }
    nodes.push(
      h('div', { class: 'series', style: at(-3, 3) }, 'Ln'),
      h('div', { class: 'series', style: at(-2, 3) }, 'An'),
      h('div', { class: 'cell placeholder', style: at(7, 4), 'aria-hidden': 'true' }, '57–71'),
      h('div', { class: 'cell placeholder', style: at(8, 4), 'aria-hidden': 'true' }, '89–103'),
    );

    const zs = [...SYMBOLS.keys()].map((i) => i + 1);
    for (let i = 0; i < unnamedCount; i++) zs.push(FIRST_UNNAMED_Z + i);
    for (const z of zs) {
      const { row, col } = place(z);
      const option = placed.get(z);
      const content = [
        h('span', { class: 'num' }, z),
        cellSymbol(z, option),
        option?.version && h('span', { class: 'mass' }, option.version),
      ];
      if (!option) {
        nodes.push(
          h(
            'div',
            { class: 'cell soon', style: at(row, col), title: `${elementName(z)} · coming soon`, 'aria-hidden': 'true' },
            content,
          ),
        );
        continue;
      }
      const isActive = Boolean(active && active.id === option.id);
      const unavailable = option.disabled || option.locked;
      const classes = [
        'cell',
        'released',
        z >= FIRST_UNNAMED_Z && 'provisional',
        isActive && 'active',
        preview && preview.id === option.id && 'preview',
        unavailable && 'unavailable',
      ];
      const cell = h(
        'button',
        {
          type: 'button',
          class: classes.filter(Boolean).join(' '),
          style: at(row, col),
          'data-key': `model:${option.id}`,
          'aria-pressed': String(isActive),
          'aria-disabled': unavailable ? 'true' : null,
          'aria-label': [option.title, option.description].filter(Boolean).join(', '),
          onclick: () => handlers.onChooseModel(option),
          onpointerenter: () => setPreview(option.id),
          onfocus: () => setPreview(option.id),
        },
        content,
        h('span', { class: 'dot', 'aria-hidden': 'true' }),
      );
      cells.set(option.id, cell);
      nodes.push(cell);
    }

    const named = [...placed.values()].filter((o) => o.z);
    const versions = named.map((o) => o.version).filter(Boolean);
    const version =
      (active?.z && active.version) || versions.sort((a, b) => parseFloat(b) - parseFloat(a))[0] || '';
    nodes.push(
      h(
        'div',
        { class: 'hero' },
        h('h3', null, version ? `Gemini ${version}` : 'Gemini'),
        h(
          'div',
          { class: 'legend' },
          h('span', { class: 'on' }, `${named.length} released`),
          unnamedCount > 0 && h('span', { class: 'unnamed' }, `${unnamedCount} unnamed`),
          h('span', { class: 'off' }, 'Coming soon'),
        ),
      ),
    );
    nodes.push(h('div', { class: 'card-slot' }, buildCard(view)));
    return h(
      'div',
      {
        class: 'table',
        style: {
          gridTemplateRows: `16px repeat(${7 + unnamedRows}, var(--cell-h)) 12px repeat(2, var(--cell-h))`,
        },
        onpointerleave: () => setPreview(null),
      },
      nodes,
    );
  }

  function buildFooter(): HTMLElement {
    const state = handlers.getState();
    const status = state.error
      ? h('span', { class: 'status error', role: 'alert' }, state.error)
      : h('span', { class: 'status' }, state.busy && !state.options.length ? 'Reading Gemini models…' : '');
    return h(
      'footer',
      null,
      status,
      h('button', { type: 'button', class: 'native', onclick: handlers.onOpenNativeMenu }, 'Gemini menu'),
    );
  }

  function reflectBusy(busy: number): void {
    body.toggleAttribute('data-busy', busy > 0);
    body.setAttribute('aria-busy', String(busy > 0));
  }

  function position(anchorHost: HTMLElement): void {
    if (!handlers.getState().open) return;
    const anchor = anchorHost.closest('input-area-v2, input-container, .input-area, fieldset') ?? anchorHost;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(PANEL_MAX_WIDTH, innerWidth - 2 * VIEWPORT_MARGIN);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN),
      innerWidth - width - VIEWPORT_MARGIN,
    );
    host.style.width = `${width}px`;
    host.style.left = `${left}px`;
    const height = host.offsetHeight;
    let top: number;
    if (rect.bottom + 8 + height <= innerHeight - VIEWPORT_MARGIN) top = rect.bottom + 8;
    else if (rect.top - 8 - height >= VIEWPORT_MARGIN) top = rect.top - 8 - height;
    else top = Math.max(VIEWPORT_MARGIN, innerHeight - VIEWPORT_MARGIN - height);
    host.style.top = `${top}px`;
  }

  function render(anchorHost: HTMLElement): void {
    const state = handlers.getState();
    if (!state.open) return;
    const focused = root.activeElement;
    const focusKey = focused?.getAttribute('data-key');
    const view = layout();
    body.dataset.theme = isDark() ? 'dark' : 'light';
    body.replaceChildren(
      h(
        'header',
        null,
        h('span', { class: 'spark', 'aria-hidden': 'true' }, '✦'),
        h('h2', null, 'Model periodic table'),
        h('span', { class: 'spin', 'aria-hidden': 'true' }),
      ),
      buildTable(view),
      buildFooter(),
    );
    reflectBusy(state.busy);
    if (focusKey) {
      const again = Array.from(body.querySelectorAll<HTMLElement>('[data-key]')).find(
        (el) => el.getAttribute('data-key') === focusKey,
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
    focus: () => body.focus({ preventScroll: true }),
  };
}
