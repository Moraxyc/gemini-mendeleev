import { sheet } from './dom.ts';
import { elementInText, elementName, matchActiveOption } from './elements.ts';
import {
  findPicker,
  HIDDEN_ATTR,
  isPickerDisabled,
  nativeLabel,
  readSnapshot,
  selectNativeLevel,
  selectNativeModel,
} from './gemini.ts';
import { loadCachedOptions, saveCachedOptions } from './storage.ts';
import docCss from './styles/doc.css';
import type { AppState, ModelOption } from './types.ts';
import { createPanel } from './ui/panel.ts';
import { createTrigger } from './ui/trigger.ts';

const state: AppState = {
  options: loadCachedOptions(),
  thinking: null,
  loaded: false,
  busy: 0,
  error: '',
  open: false,
  previewId: null,
  pendingId: null,
};

function activeOption(): ModelOption | null {
  if (state.pendingId) return state.options.find((o) => o.id === state.pendingId) ?? null;
  return matchActiveOption(state.options, nativeLabel().primary);
}

const trigger = createTrigger({
  onToggle: () => (state.open ? closePanel() : openPanel()),
  onPrefetch: () => {
    if (!state.loaded) void refresh();
  },
});

const panel = createPanel({
  getState: () => state,
  getActiveOption: activeOption,
  onChooseModel: (option) => void chooseModel(option),
  onChooseLevel: (label) => void chooseLevel(label),
  onOpenNativeMenu: openNativeMenu,
  onPreviewChange: (id) => {
    state.previewId = id;
  },
});

function updateTrigger(): void {
  const picker = findPicker();
  const { primary, secondary } = nativeLabel();
  const active = activeOption();
  const z = active ? active.z : elementInText(primary);
  const main = (z ? elementName(z) : active ? active.name : primary) || 'Model';
  trigger.update({
    main,
    sub: secondary,
    disabled: isPickerDisabled(picker),
    ariaLabel: `Choose model, current: ${active ? active.title : primary}`,
    open: state.open,
  });
}

async function snapshot(): Promise<void> {
  const snap = await readSnapshot();
  state.options = snap.options;
  state.thinking = snap.thinking;
  state.loaded = true;
  saveCachedOptions(snap.options);
}

async function act(work: () => Promise<void>): Promise<void> {
  state.busy++;
  panel.reflectBusy(state.busy);
  try {
    await work();
    state.error = '';
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    console.warn('[gemini-mendeleev]', err);
  } finally {
    state.busy--;
    state.pendingId = null;
    panel.reflectBusy(state.busy);
    updateTrigger();
    if (state.open) panel.render(trigger.host);
  }
}

let refreshing: Promise<void> | null = null;
function refresh(): Promise<void> {
  refreshing ??= act(snapshot).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function chooseModel(option: ModelOption): Promise<void> | undefined {
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

function chooseLevel(label: string): Promise<void> | undefined {
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

function openPanel(): void {
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

function closePanel({ restoreFocus = false } = {}): void {
  if (!state.open) return;
  state.open = false;
  panel.host.hidden = true;
  updateTrigger();
  if (restoreFocus) trigger.button.focus({ preventScroll: true });
}

function openNativeMenu(): void {
  closePanel();
  findPicker()?.click();
}

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!state.open) return;
    const path = event.composedPath();
    if (!path.includes(panel.host) && !path.includes(trigger.host)) closePanel();
  },
  true,
);

document.addEventListener(
  'keydown',
  (event) => {
    if (state.open && event.key === 'Escape') {
      event.stopPropagation();
      closePanel({ restoreFocus: true });
    }
  },
  true,
);

addEventListener('resize', () => panel.position(trigger.host));

function sync(): void {
  const picker = findPicker();
  if (!picker) {
    closePanel();
    return;
  }
  if (!picker.hasAttribute(HIDDEN_ATTR)) {
    picker.setAttribute(HIDDEN_ATTR, '');
    picker.setAttribute('tabindex', '-1');
    picker.setAttribute('aria-hidden', 'true');
  }
  if (picker.previousElementSibling !== trigger.host) picker.before(trigger.host);
  updateTrigger();
}

let syncQueued = false;
function scheduleSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    sync();
  });
}

document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet(docCss)];
new MutationObserver(scheduleSync).observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['aria-expanded', 'aria-disabled', 'disabled'],
});
sync();
