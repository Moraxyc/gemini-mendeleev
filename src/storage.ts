import { classify } from './elements.ts';
import type { ModelOption, RawOption } from './types.ts';

const STORE_KEY = 'gemini-mendeleev:models';

export function loadCachedOptions(): ModelOption[] {
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(cached)) return [];
    return cached.map((o) => classify({ ...(o as RawOption), selected: false }));
  } catch {
    return [];
  }
}

export function saveCachedOptions(options: ModelOption[]): void {
  const stored = options.map(({ id, modeId, name, description, disabled, locked }) => ({
    id,
    modeId,
    name,
    description,
    disabled,
    locked,
  }));
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  } catch {
    // Storage may be unavailable; live menu data still works.
  }
}
