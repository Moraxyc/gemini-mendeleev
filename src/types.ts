export interface RawOption {
  id: string;
  modeId: string;
  name: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  locked: boolean;
}

export interface ModelOption extends RawOption {
  z: number;
  version: string;
  title: string;
}

export interface ThinkingLevel {
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
}

export interface AppState {
  options: ModelOption[];
  thinking: ThinkingLevel[] | null;
  loaded: boolean;
  busy: number;
  error: string;
  open: boolean;
  previewId: string | null;
  pendingId: string | null;
  pendingLevel: string | null;
}

export interface TableView {
  // Atomic number -> model; unnamed models get numbers from FIRST_UNNAMED_Z.
  placed: Map<number, ModelOption>;
  zById: Map<string, number>;
  unnamedCount: number;
  active: ModelOption | null;
  preview: ModelOption | null;
}

export interface PickerLabel {
  primary: string;
  secondary: string;
}
