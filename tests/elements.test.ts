import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classify,
  elementInText,
  matchActiveOption,
  modelSymbol,
  place,
  systematicName,
  systematicSymbol,
} from '../src/elements.ts';
import type { RawOption } from '../src/types.ts';

const raw = (overrides: Partial<RawOption>): RawOption => ({
  id: 'test-id',
  modeId: 'test-id',
  name: '4 Hydrogen',
  description: '',
  selected: false,
  disabled: false,
  locked: false,
  ...overrides,
});

test('place maps main group, lanthanide, actinide, and period 8 elements to grid coordinates', () => {
  assert.deepEqual(place(1), { row: 2, col: 2 }); // H
  assert.deepEqual(place(2), { row: 2, col: 19 }); // He
  assert.deepEqual(place(18), { row: 4, col: 19 }); // Ar
  assert.deepEqual(place(57), { row: -3, col: 4 }); // La
  assert.deepEqual(place(71), { row: -3, col: 18 }); // Lu
  assert.deepEqual(place(89), { row: -2, col: 4 }); // Ac
  assert.deepEqual(place(103), { row: -2, col: 18 }); // Lr
  assert.deepEqual(place(118), { row: 8, col: 19 }); // Og
  assert.deepEqual(place(119), { row: 9, col: 2 }); // Uue
  assert.deepEqual(place(136), { row: 9, col: 19 });
  assert.deepEqual(place(137), { row: 10, col: 2 });
});

test('systematic names follow IUPAC placeholder rules', () => {
  assert.equal(systematicName(119), 'Ununennium');
  assert.equal(systematicName(120), 'Unbinilium');
  assert.equal(systematicName(122), 'Unbibium');
  assert.equal(systematicName(123), 'Unbitrium');
  assert.equal(systematicName(190), 'Unennilium');
  assert.equal(systematicSymbol(119), 'Uue');
  assert.equal(systematicSymbol(120), 'Ubn');
});

test('modelSymbol abbreviates unnamed model names', () => {
  assert.equal(modelSymbol('3.1 Pro'), 'Pro');
  assert.equal(modelSymbol('3.5 Flash-Lite'), 'FL');
  assert.equal(modelSymbol('Gemini 2.5 Flash'), 'Fla');
  assert.equal(modelSymbol('Deep Research'), 'DR');
});

test('classify extracts version, atomic number, and normalized title', () => {
  const h4 = classify(raw({ name: '4 Hydrogen' }));
  assert.equal(h4.z, 1);
  assert.equal(h4.version, '4');
  assert.equal(h4.title, 'Gemini 4 Hydrogen');

  const prefixed = classify(raw({ name: 'Gemini 4.1 Argon' }));
  assert.equal(prefixed.z, 18);
  assert.equal(prefixed.version, '4.1');
  assert.equal(prefixed.title, 'Gemini 4.1 Argon');

  const alias = classify(raw({ name: '4 Aluminum' }));
  assert.equal(alias.z, 13);
  assert.equal(alias.title, 'Gemini 4 Aluminium');

  const other = classify(raw({ name: '3.5 Flash-Lite' }));
  assert.equal(other.z, 0);
  assert.equal(other.version, '3.5');
  assert.equal(other.title, 'Gemini 3.5 Flash-Lite');
});

test('elementInText detects element names inside picker labels', () => {
  assert.equal(elementInText('Hydrogen High'), 1);
  assert.equal(elementInText('Gemini 4 Argon'), 18);
  assert.equal(elementInText('3.1 Pro'), 0);
});

test('matchActiveOption prioritizes exact label matches then longest substring then selected flag', () => {
  const options = [
    classify(raw({ id: 'flash', name: '3.5 Flash-Lite', description: 'Quick answers' })),
    classify(raw({ id: 'h', name: '4 Hydrogen', description: 'Everyday help', selected: true })),
    classify(raw({ id: 'ar', name: '4 Argon', description: 'Code & analysis' })),
  ];

  assert.equal(matchActiveOption(options, 'Argon')?.id, 'ar');
  assert.equal(matchActiveOption(options, 'Quick answers')?.id, 'flash');
  assert.equal(matchActiveOption(options, 'Using 3.5 Flash-Lite right now')?.id, 'flash');
  assert.equal(matchActiveOption(options, 'Unknown label')?.id, 'h');
});
