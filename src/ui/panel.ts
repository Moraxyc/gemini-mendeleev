import { at, h, sheet } from '../dom.ts';
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
const ANCHOR_GAP = 8;
// Below this the cells get hard to read, so the table may cover the input box instead.
const MIN_SCALE = 0.6;
const GROUPS = 18;
const TYPEAHEAD_RESET_MS = 1000;

// [columns, rows] per arrow key.
const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface CellRef {
  el: HTMLButtonElement;
  row: number;
  col: number;
  z: number;
  symbol: string;
}

const cellSymbol = (z: number, option: ModelOption | undefined): string =>
  z < FIRST_UNNAMED_Z || !option ? elementSymbol(z) : modelSymbol(option.name);

export interface PanelHandlers {
  getState: () => AppState;
  getActiveOption: () => ModelOption | null;
  onChooseModel: (option: ModelOption) => void;
  onChooseLevel: (label: string) => void;
  onDismissTooltip: () => void;
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
  focusCell(id: string): void;
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

  const cells = new Map<string, CellRef>();
  const headerEl = h(
    'header',
    null,
    h('span', { class: 'spark', 'aria-hidden': 'true' }, '✦'),
    h('h2', null, 'Model periodic table'),
    h('span', { class: 'spin', 'aria-hidden': 'true' }),
  );
  body.append(headerEl);
  let tableEl: HTMLElement | null = null;
  let footerEl: HTMLElement | null = null;
  let tipEl: HTMLElement | null = null;
  let tipKey = '';
  let cardEl: HTMLButtonElement | null = null;
  let previewSlot: HTMLSpanElement | null = null;
  let lastTooltipId: string | null = null;
  let lastTooltipReady = false;

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

  function cardHint(active: ModelOption | null, preview: ModelOption): string {
    const state = handlers.getState();
    const isActive = Boolean(active && active.id === preview.id);
    if (preview.locked) return 'Requires an upgrade';
    if (preview.disabled) return 'Not available right now';
    if (!isActive) return 'Click to switch';
    if (state.thinking?.length || !state.loaded) return 'Click to set thinking level';
    return '';
  }

  function syncCard(active: ModelOption | null, preview: ModelOption): void {
    if (!cardEl) return;
    const state = handlers.getState();
    const isActive = Boolean(active && active.id === preview.id);
    const clickable =
      !preview.locked && !preview.disabled && (!isActive || Boolean(state.thinking?.length) || !state.loaded);
    cardEl.classList.toggle('clickable', clickable);
    cardEl.disabled = !clickable;
    const hint = cardHint(active, preview);
    cardEl.setAttribute('aria-label', [preview.title, preview.description, hint].filter(Boolean).join(', '));
  }

  function buildCard({ active, preview, zById }: TableView): HTMLElement {
    const state = handlers.getState();
    if (!preview) {
      cardEl = null;
      previewSlot = null;
      const message = state.busy ? 'Reading Gemini models…' : 'No models found';
      return h('div', { class: 'card' }, h('div', { class: 'card-hint' }, message));
    }
    previewSlot = h('span', { class: 'card-preview' }, buildPreview(active, preview, zById));
    cardEl = h(
      'button',
      {
        type: 'button',
        class: 'card',
        'data-key': 'card',
        onclick: () => {
          const current = layout().preview;
          if (current) handlers.onChooseModel(current);
        },
      },
      previewSlot,
    );
    syncCard(active, preview);
    return cardEl;
  }

  function buildTooltipSpec(): { id: string; key: string; children: Node[] } | null {
    const state = handlers.getState();
    if (!state.tooltipId) return null;
    const option = state.options.find((o) => o.id === state.tooltipId);
    if (!option || !cells.has(option.id)) return null;
    const modelLabel = option.z ? elementName(option.z) : option.name;
    const title = h('div', { class: 'tooltip-title', id: 'gm-thinking' }, `Thinking level · ${modelLabel}`);

    if (state.pendingId === option.id && !state.thinking) {
      return {
        id: option.id,
        key: `${option.id}:pending`,
        children: [title, h('div', { class: 'tooltip-hint' }, 'Switching model…')],
      };
    }
    if (!state.thinking?.length) {
      if (state.loaded) return null;
      return {
        id: option.id,
        key: `${option.id}:loading`,
        children: [title, h('div', { class: 'tooltip-hint' }, 'Loading thinking levels…')],
      };
    }

    const selectedDesc = state.thinking.find((l) => l.selected)?.description ?? '';
    const descEl = state.thinking.some((l) => l.description)
      ? h('div', { class: 'tooltip-desc' }, selectedDesc)
      : null;
    const setDesc = (text: string) => {
      if (descEl) descEl.textContent = text;
    };

    const seg = h(
      'div',
      {
        class: 'seg',
        role: 'radiogroup',
        'aria-labelledby': 'gm-thinking',
        onpointerleave: () => setDesc(selectedDesc),
      },
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
            onpointerenter: () => setDesc(level.description || selectedDesc),
            onfocus: () => setDesc(level.description || selectedDesc),
          },
          level.label,
        ),
      ),
    );
    const key =
      `${option.id}:` +
      state.thinking
        .map((l) => `${l.label}\0${l.description}\0${l.selected ? 1 : 0}\0${l.disabled ? 1 : 0}`)
        .join('\n');
    return { id: option.id, key, children: descEl ? [title, seg, descEl] : [title, seg] };
  }

  function buildPreview(active: ModelOption | null, preview: ModelOption, zById: Map<string, number>): HTMLSpanElement {
    const hint = cardHint(active, preview);
    const z = zById.get(preview.id) ?? 0;
    const provisional = z >= FIRST_UNNAMED_Z;
    return h(
      'span',
      { class: 'card-head' },
      h(
        'span',
        { class: provisional ? 'tile provisional' : 'tile' },
        h('span', { class: 'num' }, z),
        cellSymbol(z, preview),
      ),
      h(
        'span',
        { class: 'card-text' },
        h('span', { class: 'card-title', title: preview.title }, preview.title),
        preview.description && h('span', { class: 'card-desc', title: preview.description }, preview.description),
        provisional &&
          h(
            'span',
            { class: 'card-desc', title: 'IUPAC placeholder name: this model has no element yet' },
            `${systematicSymbol(z)} · ${systematicName(z)}`,
          ),
        hint && h('span', { class: 'card-hint' }, hint),
      ),
    );
  }

  // Mutates classes and the card in place so the hovered cell stays mounted for click.
  function setPreview(id: string | null): void {
    const state = handlers.getState();
    if (state.previewId === id) return;
    handlers.onPreviewChange(id);
    const view = layout();
    for (const [optionId, { el }] of cells) {
      el.classList.toggle('preview', Boolean(view.preview && view.preview.id === optionId));
    }
    if (view.preview) {
      previewSlot?.replaceChildren(buildPreview(view.active, view.preview, view.zById));
      syncCard(view.active, view.preview);
    }
  }

  function buildTable(view: TableView): HTMLDivElement {
    const { placed, active, preview, unnamedCount } = view;
    cells.clear();
    const nodes: HTMLElement[] = [];
    const unnamedRows = Math.ceil(unnamedCount / GROUPS);
    const rowCount = 11 + unnamedRows;
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
        handlers.getState().tooltipId === option.id && 'tooltip-anchor',
        option.locked && 'locked',
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
          'aria-label': [option.title, option.description, option.locked && 'requires an upgrade']
            .filter(Boolean)
            .join(', '),
          onclick: () => handlers.onChooseModel(option),
          onpointerenter: () => setPreview(option.id),
          onfocus: () => setPreview(option.id),
        },
        content,
      );
      // Negative rows count grid lines from the end.
      const visualRow = row < 0 ? rowCount + 2 + row : row;
      cells.set(option.id, { el: cell, row: visualRow, col, z, symbol: cellSymbol(z, option) });
      nodes.push(cell);
    }

    const models = [...placed.values()];
    const named = models.filter((o) => o.z);
    const lockedCount = models.filter((o) => o.locked).length;
    const legendItem = (swatch: string, label: string) =>
      h('span', null, h('i', { class: `cell swatch ${swatch}`, 'aria-hidden': 'true' }), label);
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
          legendItem('released', `${named.filter((o) => !o.locked).length} released`),
          unnamedCount > 0 && legendItem('released provisional', `${unnamedCount} unnamed`),
          lockedCount > 0 && legendItem('released locked', `${lockedCount} upgrade`),
          legendItem('soon', 'Coming soon'),
        ),
      ),
    );
    nodes.push(h('div', { class: 'card-slot' }, buildCard(view)));
    return h(
      'div',
      {
        class: 'table',
        style: {
          gridTemplateRows: `16px repeat(${rowCount - 4}, var(--cell-h)) 12px repeat(2, var(--cell-h))`,
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

  function activeCell(): CellRef | undefined {
    const active = handlers.getActiveOption();
    return (active && cells.get(active.id)) || cells.values().next().value;
  }

  // Picks the nearest cell in the arrow's direction, preferring cells in line with the origin.
  function cellToward(from: CellRef, [dx, dy]: [number, number]): CellRef | undefined {
    let best: CellRef | undefined;
    let bestScore = Infinity;
    for (const cell of cells.values()) {
      const along = dx ? (cell.col - from.col) * dx : (cell.row - from.row) * dy;
      if (along <= 0) continue;
      const across = dx ? Math.abs(cell.row - from.row) : Math.abs(cell.col - from.col);
      const score = along + 3 * across;
      if (score < bestScore) [best, bestScore] = [cell, score];
    }
    return best;
  }

  let typed = '';
  let typedAt = 0;

  // Typing "ar" jumps to Ar, "18" to element 18.
  function typeahead(key: string): CellRef | undefined {
    const now = performance.now();
    typed = now - typedAt < TYPEAHEAD_RESET_MS ? typed + key.toLowerCase() : key.toLowerCase();
    typedAt = now;
    const find = (query: string) => {
      const all = [...cells.values()];
      const keys = (c: CellRef) => [c.symbol.toLowerCase(), String(c.z)];
      return (
        all.find((c) => keys(c).includes(query)) ?? all.find((c) => keys(c).some((k) => k.startsWith(query)))
      );
    };
    const match = find(typed);
    if (match || typed.length === 1) return match;
    typed = key.toLowerCase();
    return find(typed);
  }

  function moveInSeg(from: HTMLElement, key: string): HTMLElement | undefined {
    const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : key === 'ArrowRight' || key === 'ArrowDown' ? 1 : 0;
    if (!step) return;
    const buttons = Array.from(from.parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = buttons.indexOf(from as HTMLButtonElement);
    return buttons[(i + step + buttons.length) % buttons.length];
  }

  body.addEventListener('pointerdown', (event) => {
    if (!handlers.getState().tooltipId) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.tooltip') || target?.closest('.cell.released') || target?.closest('.card.clickable')) return;
    handlers.onDismissTooltip();
  });

  body.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const focused = root.activeElement instanceof HTMLElement ? root.activeElement : null;
    let next: HTMLElement | undefined;
    if (focused?.closest('.seg')) {
      next = moveInSeg(focused, event.key);
    } else if (event.key in DIRECTIONS) {
      if (handlers.getState().tooltipId) handlers.onDismissTooltip();
      const from = [...cells.values()].find((c) => c.el === focused);
      next = (from ? cellToward(from, DIRECTIONS[event.key]!) : activeCell())?.el;
    } else if (/^[\p{L}\p{N}]$/u.test(event.key)) {
      if (handlers.getState().tooltipId) handlers.onDismissTooltip();
      next = typeahead(event.key)?.el;
    }
    if (!next) return;
    // Keep Gemini's own shortcuts from seeing keys the table consumed.
    event.preventDefault();
    event.stopPropagation();
    next.focus({ preventScroll: true });
  });

  function reflectBusy(busy: number): void {
    body.toggleAttribute('data-busy', busy > 0);
    body.setAttribute('aria-busy', String(busy > 0));
  }

  function minPanelWidth(): number {
    const table = body.querySelector('.table');
    const style = getComputedStyle(body);
    const chrome = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'] as const;
    return (
      (table ? parseFloat(getComputedStyle(table).minWidth) || 0 : 0) +
      chrome.reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0)
    );
  }

  function positionTooltip(): void {
    const tip = body.querySelector<HTMLElement>('.tooltip');
    const tooltipId = handlers.getState().tooltipId;
    const cell = tooltipId ? cells.get(tooltipId) : undefined;
    if (!tip || !cell) return;

    const bodyRect = body.getBoundingClientRect();
    const cellRect = cell.el.getBoundingClientRect();
    const scale = body.offsetWidth ? bodyRect.width / body.offsetWidth : 1;
    const cellLeft = (cellRect.left - bodyRect.left) / scale + body.scrollLeft;
    const cellTop = (cellRect.top - bodyRect.top) / scale + body.scrollTop;
    const cellWidth = cellRect.width / scale;
    const cellHeight = cellRect.height / scale;

    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    const panelW = body.clientWidth;
    const panelH = body.clientHeight;
    const gap = 10;
    const margin = 12;

    const spaceBelow = panelH - (cellTop - body.scrollTop + cellHeight) - margin;
    const spaceAbove = cellTop - body.scrollTop - margin;
    const placeAbove = spaceBelow < tipHeight + gap && spaceAbove >= spaceBelow;
    const rawTop = placeAbove ? cellTop - gap - tipHeight : cellTop + cellHeight + gap;
    const top = Math.max(
      body.scrollTop + margin,
      Math.min(rawTop, body.scrollTop + Math.max(margin, panelH - tipHeight - margin)),
    );

    const centerX = cellLeft + cellWidth / 2;
    const left = Math.max(margin, Math.min(centerX - tipWidth / 2, panelW - tipWidth - margin));
    const arrowX = Math.max(16, Math.min(centerX - left, tipWidth - 16));

    tip.dataset.placement = placeAbove ? 'top' : 'bottom';
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.setProperty('--arrow-x', `${arrowX}px`);
  }

  // Shrinks the whole table instead of scrolling it, so it fits beside the input box when possible.
  function position(anchorHost: HTMLElement): void {
    if (!handlers.getState().open) return;
    const anchor = anchorHost.closest('input-area-v2, input-container, .input-area, fieldset') ?? anchorHost;
    const rect = anchor.getBoundingClientRect();
    const fitWidth = innerWidth - 2 * VIEWPORT_MARGIN;
    const fitHeight = innerHeight - 2 * VIEWPORT_MARGIN;
    const below = innerHeight - VIEWPORT_MARGIN - rect.bottom - ANCHOR_GAP;
    const above = rect.top - ANCHOR_GAP - VIEWPORT_MARGIN;

    const minWidth = minPanelWidth();
    body.style.width = `${Math.max(minWidth, Math.min(PANEL_MAX_WIDTH, fitWidth))}px`;
    body.style.maxHeight = 'none';
    const naturalHeight = body.offsetHeight;
    const widthScale = Math.min(1, fitWidth / minWidth);
    let scale = Math.min(widthScale, Math.max(below, above) / naturalHeight);
    const beside = scale >= MIN_SCALE;
    if (!beside) scale = Math.max(MIN_SCALE, Math.min(widthScale, fitHeight / naturalHeight));

    const layoutWidth = Math.max(minWidth, Math.min(PANEL_MAX_WIDTH, fitWidth / scale));
    body.style.width = `${layoutWidth}px`;
    body.style.maxHeight = `${fitHeight / scale}px`;
    body.style.transform = scale < 1 ? `scale(${scale})` : '';
    const width = layoutWidth * scale;
    const height = body.offsetHeight * scale;
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    host.style.left = `${Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN),
      innerWidth - width - VIEWPORT_MARGIN,
    )}px`;
    let top: number;
    if (beside && below >= height) top = rect.bottom + ANCHOR_GAP;
    else if (beside) top = rect.top - ANCHOR_GAP - height;
    else top = Math.max(VIEWPORT_MARGIN, innerHeight - VIEWPORT_MARGIN - height);
    host.style.top = `${top}px`;
    positionTooltip();
  }

  function render(anchorHost: HTMLElement): void {
    const state = handlers.getState();
    if (!state.open) return;
    const focused = root.activeElement;
    const focusKey = focused?.getAttribute('data-key');
    const view = layout();
    body.dataset.theme = isDark() ? 'dark' : 'light';

    const nextTable = buildTable(view);
    if (tableEl) tableEl.replaceWith(nextTable);
    else body.append(nextTable);
    tableEl = nextTable;

    const nextFooter = buildFooter();
    if (footerEl) footerEl.replaceWith(nextFooter);
    else body.append(nextFooter);
    footerEl = nextFooter;

    const tip = buildTooltipSpec();
    if (!tip) {
      tipEl?.remove();
      tipEl = null;
      tipKey = '';
    } else if (tipEl && lastTooltipId === tip.id) {
      if (tipKey !== tip.key) {
        tipEl.replaceChildren(...tip.children);
        tipKey = tip.key;
      }
    } else {
      tipEl?.remove();
      tipEl = h('div', { class: 'tooltip', role: 'dialog', 'aria-labelledby': 'gm-thinking' }, tip.children);
      tipKey = tip.key;
      body.append(tipEl);
    }

    reflectBusy(state.busy);

    const tooltipReady = Boolean(tip && state.thinking?.length);
    const shouldFocusTooltip =
      tooltipReady &&
      (lastTooltipId !== state.tooltipId ||
        (!lastTooltipReady && (!focusKey || focusKey === `model:${state.tooltipId}` || focusKey === 'card')));
    lastTooltipId = tip?.id ?? null;
    lastTooltipReady = tooltipReady;

    const tooltipFocusTarget = shouldFocusTooltip
      ? (body.querySelector<HTMLButtonElement>('.tooltip .seg button.on:not(:disabled)') ??
        body.querySelector<HTMLButtonElement>('.tooltip .seg button:not(:disabled)'))
      : null;

    // The panel itself holds focus when it opened before any model was known.
    const again =
      tooltipFocusTarget ??
      (focusKey
        ? Array.from(body.querySelectorAll<HTMLElement>('[data-key]')).find(
            (el) => el.getAttribute('data-key') === focusKey,
          )
        : focused === body
          ? activeCell()?.el
          : undefined);
    again?.focus({ preventScroll: true });
    position(anchorHost);
  }

  return {
    host,
    body,
    render,
    reflectBusy,
    position,
    focus: () => (activeCell()?.el ?? body).focus({ preventScroll: true }),
    focusCell: (id: string) => cells.get(id)?.el.focus({ preventScroll: true }),
  };
}
