import type { ModelOption, RawOption } from './types.ts';

export const SYMBOLS = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
).split(' ');

export const NAMES = (
  'Hydrogen Helium Lithium Beryllium Boron Carbon Nitrogen Oxygen Fluorine Neon Sodium Magnesium Aluminium ' +
  'Silicon Phosphorus Sulfur Chlorine Argon Potassium Calcium Scandium Titanium Vanadium Chromium Manganese ' +
  'Iron Cobalt Nickel Copper Zinc Gallium Germanium Arsenic Selenium Bromine Krypton Rubidium Strontium ' +
  'Yttrium Zirconium Niobium Molybdenum Technetium Ruthenium Rhodium Palladium Silver Cadmium Indium Tin ' +
  'Antimony Tellurium Iodine Xenon Caesium Barium Lanthanum Cerium Praseodymium Neodymium Promethium ' +
  'Samarium Europium Gadolinium Terbium Dysprosium Holmium Erbium Thulium Ytterbium Lutetium Hafnium ' +
  'Tantalum Tungsten Rhenium Osmium Iridium Platinum Gold Mercury Thallium Lead Bismuth Polonium Astatine ' +
  'Radon Francium Radium Actinium Thorium Protactinium Uranium Neptunium Plutonium Americium Curium ' +
  'Berkelium Californium Einsteinium Fermium Mendelevium Nobelium Lawrencium Rutherfordium Dubnium ' +
  'Seaborgium Bohrium Hassium Meitnerium Darmstadtium Roentgenium Copernicium Nihonium Flerovium ' +
  'Moscovium Livermorium Tennessine Oganesson'
).split(' ');

export const Z_BY_NAME = new Map<string, number>(NAMES.map((name, i) => [name.toLowerCase(), i + 1]));
for (const [alias, z] of [
  ['aluminum', 13],
  ['cesium', 55],
  ['sulphur', 16],
] as const) {
  Z_BY_NAME.set(alias, z);
}

const ELEMENT_MODEL = /^(?:gemini\s+)?(\d+(?:\.\d+)*)\s+(\p{L}+)$/iu;
const VERSION_PREFIX = /^(?:gemini\s+)?(\d+(?:\.\d+)*)\b\s*/iu;

// Models without an element name sit in period 8 under IUPAC placeholder numbers.
export const FIRST_UNNAMED_Z = 119;
const GROUPS = 18;
const ROOTS = ['nil', 'un', 'bi', 'tri', 'quad', 'pent', 'hex', 'sept', 'oct', 'enn'];

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function systematicName(z: number): string {
  const roots = Array.from(String(z), (d) => ROOTS[Number(d)]).join('');
  return capitalize(`${roots}ium`.replace('nnn', 'nn').replace('iium', 'ium'));
}

export function systematicSymbol(z: number): string {
  return capitalize(Array.from(String(z), (d) => (ROOTS[Number(d)] ?? '').charAt(0)).join(''));
}

// "3.1 Pro" -> "Pro", "3.5 Flash-Lite" -> "FL"
export function modelSymbol(name: string): string {
  const words = name.replace(VERSION_PREFIX, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length > 1) return words.slice(0, 3).map((w) => w.charAt(0).toUpperCase()).join('');
  return capitalize((words[0] ?? '').slice(0, 3).toLowerCase());
}

export function elementName(z: number): string {
  return NAMES[z - 1] ?? '';
}

export function elementSymbol(z: number): string {
  return SYMBOLS[z - 1] ?? '';
}

// Row 1 and column 1 are header tracks. The f-block rows use negative lines because
// period 8 grows the grid above them.
export function place(z: number): { row: number; col: number } {
  if (z >= 57 && z <= 71) return { row: -3, col: z - 57 + 4 };
  if (z >= 89 && z <= 103) return { row: -2, col: z - 89 + 4 };
  if (z >= FIRST_UNNAMED_Z) {
    const i = z - FIRST_UNNAMED_Z;
    return { row: 9 + Math.floor(i / GROUPS), col: (i % GROUPS) + 2 };
  }
  const [period, group] =
    z === 1 ? [1, 1] : z === 2 ? [1, 18] :
    z <= 4 ? [2, z - 2] : z <= 10 ? [2, z + 8] :
    z <= 12 ? [3, z - 10] : z <= 18 ? [3, z] :
    z <= 36 ? [4, z - 18] : z <= 54 ? [5, z - 36] :
    z <= 56 ? [6, z - 54] : z <= 86 ? [6, z - 68] :
    z <= 88 ? [7, z - 86] : [7, z - 100];
  return { row: period + 1, col: group + 1 };
}

export function classify(raw: RawOption): ModelOption {
  const match = ELEMENT_MODEL.exec(raw.name);
  const key = (match?.[2] ?? raw.modeId).toLowerCase();
  const z = Z_BY_NAME.get(key) ?? 0;
  const version = match?.[1] ?? VERSION_PREFIX.exec(raw.name)?.[1] ?? '';
  const title = z
    ? ['Gemini', version, elementName(z)].filter(Boolean).join(' ')
    : /^gemini\b/i.test(raw.name)
      ? raw.name
      : `Gemini ${raw.name}`;
  return { ...raw, z, version, title };
}

export function elementInText(text: string): number {
  for (const word of text.split(/[^\p{L}]+/u)) {
    const z = Z_BY_NAME.get(word.toLowerCase());
    if (z) return z;
  }
  return 0;
}

export function matchActiveOption(options: ModelOption[], primaryLabel: string): ModelOption | null {
  const text = primaryLabel.toLowerCase();
  if (text) {
    const labels = (o: ModelOption): string[] =>
      [o.name, o.title, o.description, o.z ? elementName(o.z) : '']
        .filter(Boolean)
        .map((s) => s.toLowerCase());
    const exact = options.find((o) => labels(o).includes(text));
    if (exact) return exact;
    const partial = options
      .filter((o) => text.includes(o.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (partial) return partial;
  }
  return options.find((o) => o.selected) ?? null;
}
