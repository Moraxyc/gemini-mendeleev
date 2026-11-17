import { cleanText, deepActiveElement, sleep, waitFor } from './dom.ts';
import { classify } from './elements.ts';
import type { ModelOption, PickerLabel, ThinkingLevel } from './types.ts';

export const PICKER = [
  'button[data-test-id="bard-mode-menu-button"]',
  'bard-mode-switcher button.input-area-switch',
  'button[data-test-id="model-selector"]',
].join(', ');

const MENU_ITEM = 'gem-menu-item, [role^="menuitem"]';
const ICON = 'mat-icon, .mat-icon, gem-icon, svg';

export const HIDDEN_ATTR = 'data-gm-hidden';
export const STEALTH_ATTR = 'data-gm-stealth';

let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

export const findPicker = (): HTMLElement | null => document.querySelector<HTMLElement>(PICKER);

export function isPickerDisabled(picker: HTMLElement | null): boolean {
  if (!picker) return true;
  return (
    ('disabled' in picker && Boolean((picker as HTMLButtonElement).disabled)) ||
    picker.getAttribute('aria-disabled') === 'true'
  );
}

const allItems = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(MENU_ITEM));

function isModelItem(el: Element): boolean {
  if (el.getAttribute('data-test-id') === 'mode-picker-sign-in-button') return false;
  return (
    el.hasAttribute('data-mode-id') ||
    (el.getAttribute('data-test-id') ?? '').startsWith('bard-mode-option') ||
    Boolean(el.querySelector('.mode-title'))
  );
}

export const modelItems = (): HTMLElement[] => allItems().filter(isModelItem);
export const thinkingRow = (): HTMLElement | null => document.querySelector<HTMLElement>('[value="thinking_level"]');

export function isSelected(el: Element): boolean {
  return (
    el.classList.contains('selected') ||
    el.classList.contains('is-selected') ||
    el.getAttribute('aria-checked') === 'true' ||
    el.getAttribute('aria-selected') === 'true' ||
    Boolean(el.querySelector('[fonticon="check"], [data-mat-icon-name="check"]'))
  );
}

export function isDisabled(el: Element): boolean {
  return (
    el.getAttribute('aria-disabled') === 'true' ||
    el.classList.contains('disabled') ||
    Boolean(el.querySelector('[fonticon="lock"], [data-mat-icon-name="lock"]'))
  );
}

// Current menus put the task in .label and the model name in .sublabel; older ones use .mode-title.
export function readOption(el: Element): ModelOption {
  const label = cleanText(el.querySelector('.label'), ICON);
  const sublabel = cleanText(el.querySelector('.sublabel'), ICON);
  const name = sublabel || cleanText(el.querySelector('.mode-title'), ICON) || label || cleanText(el, ICON);
  const description = sublabel ? label : cleanText(el.querySelector('.mode-desc'), ICON);
  const modeId = el.getAttribute('data-mode-id') ?? '';
  return classify({
    id: modeId || name,
    modeId,
    name,
    description,
    selected: isSelected(el),
    disabled: isDisabled(el),
    // "upsell_*" modes open an upgrade prompt and cannot be selected.
    locked: modeId.startsWith('upsell_'),
  });
}

export function readOptions(): ModelOption[] {
  const seen = new Set<string>();
  return modelItems()
    .map(readOption)
    .filter((o) => o.name && !seen.has(o.id) && seen.add(o.id));
}

// Gemini may pre-render the submenu hidden inside the row.
function levelItems(row: Element): HTMLElement[] {
  const controlsId = row.getAttribute('aria-controls');
  const submenu = (controlsId && document.getElementById(controlsId)) || row;
  return Array.from(submenu.querySelectorAll<HTMLElement>(MENU_ITEM)).filter((el) => el !== row && !isModelItem(el));
}

export async function openThinkingLevels(row: HTMLElement): Promise<HTMLElement[]> {
  if (row.getAttribute('aria-expanded') !== 'true') {
    row.click();
    await waitFor(() => row.getAttribute('aria-expanded') === 'true', 500);
  }
  await waitFor(() => levelItems(row).length > 0, 500);
  return levelItems(row);
}

export const levelLabel = (el: Element): string => cleanText(el.querySelector('.label'), ICON) || cleanText(el, ICON);

export async function readThinking(): Promise<ThinkingLevel[] | null> {
  const row = thinkingRow();
  if (!row || isDisabled(row)) return null;
  const existing = levelItems(row);
  const items = existing.length ? existing : await openThinkingLevels(row);
  if (!items.length) return null;
  return items.map((el) => ({
    label: levelLabel(el),
    description: cleanText(el.querySelector('.sublabel'), ICON),
    selected: isSelected(el),
    disabled: isDisabled(el),
  }));
}

export function isMenuOpen(picker: Element): boolean {
  const expanded = picker.getAttribute('aria-expanded');
  return expanded == null ? modelItems().length > 0 : expanded === 'true';
}

export function withNativeMenu<T>(task: () => Promise<T>): Promise<T> {
  return exclusive(async () => {
    const picker = findPicker();
    if (!picker) throw new Error("Gemini's model picker was not found");
    if (isPickerDisabled(picker)) throw new Error('The model picker is disabled right now');
    const focus = deepActiveElement();
    document.documentElement.setAttribute(STEALTH_ATTR, '');
    try {
      if (!isMenuOpen(picker)) picker.click();
      if (!(await waitFor(() => modelItems().length > 0, 1500))) {
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

export function nativeLabel(): PickerLabel {
  const picker = findPicker();
  if (!picker) return { primary: '', secondary: '' };
  const secondary = cleanText(picker.querySelector('.picker-secondary-text'), ICON);
  const primary =
    cleanText(picker.querySelector('.picker-primary-text'), ICON) ||
    cleanText(picker.querySelector('[data-test-id="logo-pill-label-container"]'), ICON) ||
    cleanText(picker, ICON).replace(secondary, '').trim();
  return { primary, secondary };
}

export async function readSnapshot(): Promise<{ options: ModelOption[]; thinking: ThinkingLevel[] | null }> {
  return withNativeMenu(async () => ({
    options: readOptions(),
    thinking: await readThinking(),
  }));
}

export async function selectNativeModel(option: ModelOption): Promise<void> {
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

export async function selectNativeLevel(label: string): Promise<void> {
  await withNativeMenu(async () => {
    const row = thinkingRow();
    if (!row) throw new Error('This model has no thinking levels');
    const target = (await openThinkingLevels(row)).find((el) => levelLabel(el) === label);
    if (!target) throw new Error(`Thinking level "${label}" was not found`);
    if (!isSelected(target)) {
      target.click();
      await sleep(150);
    }
  });
}
