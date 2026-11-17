import { at, h, sheet } from '../dom.ts';
import { elementName, elementSymbol, place, SYMBOLS } from '../elements.ts';
import panelCss from '../styles/panel.css';
import type { AppState, ModelOption, TableView } from '../types.ts';

const PANEL_MAX_WIDTH = 1040;
const VIEWPORT_MARGIN = 12;

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
  let cardSlot: HTMLDivElement | null = null;

  function layout(): TableView {
    const state = handlers.getState();
    const placed = new Map<number, ModelOption>();
    const others: ModelOption[] = [];
    for (const option of state.options) {
      if (option.z && !placed.has(option.z)) placed.set(option.z, option);
      else others.push(option);
    }
    const active = handlers.getActiveOption();
    const preview =
      state.options.find((o) => o.id === state.previewId && o.z) ??
      (active?.z ? active : placed.values().next().value) ??
      null;
    return { placed, others, active, preview };
  }

  function buildCard({ active, preview }: TableView): HTMLDivElement {
    const state = handlers.getState();
    if (!preview) {
      const message = state.busy ? 'Reading Gemini models…' : 'No element-named models found';
      return h('div', { class: 'card' }, h('div', { class: 'card-hint' }, message));
    }
    const isActive = Boolean(active && active.id === preview.id);
    let foot;
    if (preview.locked) foot = h('div', { class: 'card-hint' }, 'Requires an upgrade');
    else if (preview.disabled) foot = h('div', { class: 'card-hint' }, 'Not available right now');
    else if (!isActive) foot = h('div', { class: 'card-hint' }, 'Click the element to switch');
    else if (state.thinking) {
      foot = [
        h('div', { class: 'card-label', id: 'gm-thinking' }, 'Thinking level'),
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
    } else {
      foot = h('div', { class: 'card-hint' }, state.loaded ? 'Current model' : 'Loading thinking levels…');
    }

    return h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h('div', { class: 'tile' }, h('span', { class: 'num' }, preview.z), elementSymbol(preview.z)),
        h(
          'div',
          { class: 'card-text' },
          h('div', { class: 'card-title', title: preview.title }, preview.title),
          preview.description && h('div', { class: 'card-desc', title: preview.description }, preview.description),
        ),
      ),
      foot,
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
    if (cardSlot) cardSlot.replaceChildren(buildCard(view));
  }

  function buildTable(view: TableView): HTMLDivElement {
    const { placed, active, preview } = view;
    cells.clear();
    const nodes: HTMLElement[] = [];
    for (let g = 1; g <= 18; g++) nodes.push(h('div', { class: 'gnum', style: at(1, g + 1) }, g));
    for (let p = 1; p <= 7; p++) nodes.push(h('div', { class: 'pnum', style: at(p + 1, 1) }, p));
    nodes.push(
      h('div', { class: 'series', style: at(10, 3) }, 'Ln'),
      h('div', { class: 'series', style: at(11, 3) }, 'An'),
      h('div', { class: 'cell placeholder', style: at(7, 4), 'aria-hidden': 'true' }, '57–71'),
      h('div', { class: 'cell placeholder', style: at(8, 4), 'aria-hidden': 'true' }, '89–103'),
    );

    for (let z = 1; z <= SYMBOLS.length; z++) {
      const { row, col } = place(z);
      const option = placed.get(z);
      const content = [h('span', { class: 'num' }, z), elementSymbol(z)];
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

    const versions = [...placed.values()].map((o) => o.version).filter(Boolean);
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
          h('span', { class: 'on' }, `${placed.size} released`),
          h('span', { class: 'off' }, 'Coming soon'),
        ),
      ),
    );
    cardSlot = h('div', { class: 'card-slot' }, buildCard(view));
    nodes.push(cardSlot);
    return h('div', { class: 'table', onpointerleave: () => setPreview(null) }, nodes);
  }

  function buildFooter({ others, active }: TableView): HTMLElement {
    const state = handlers.getState();
    const status = state.error
      ? h('span', { class: 'status error', role: 'alert' }, state.error)
      : h('span', { class: 'status' }, state.busy && !state.options.length ? 'Reading Gemini models…' : '');
    return h(
      'footer',
      null,
      others.length > 0 && h('span', { class: 'label' }, 'Other models'),
      others.map((option) =>
        h(
          'button',
          {
            type: 'button',
            class: active && active.id === option.id ? 'chip on' : 'chip',
            'data-key': `model:${option.id}`,
            'aria-pressed': String(Boolean(active && active.id === option.id)),
            title: option.description || null,
            disabled: option.disabled || option.locked,
            onclick: () => handlers.onChooseModel(option),
          },
          option.name,
        ),
      ),
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
      buildFooter(view),
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
