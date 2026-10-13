import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = process.env.FYSICA_MODULE
  ? resolve(process.env.FYSICA_MODULE)
  : new URL('../src/lib/fysica.ts', import.meta.url);
let source = await readFile(sourcePath, 'utf8');

// This Node build has no built-in TypeScript support. Strip the erasable syntax
// used by this dependency-free module so node:test can still execute its JS.
source = source
  .replace(/export interface [\s\S]*?\n}\n/g, '')
  .replaceAll(': FysicaConfig', '')
  .replaceAll(': SprongBerekening | null', '')
  .replaceAll(': number | null | undefined', '')
  .replaceAll(': number | null', '')
  .replaceAll(': string | null', '')
  .replaceAll(': number', '');
const { berekenSprongMax, kompasRichting, benutting, FYSICA_DEFAULTS } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

test('berekenSprongMax matches the documented approximation calibration input', () => {
  const result = berekenSprongMax(11.70, FYSICA_DEFAULTS);
  assert.deepEqual(result, {
    theoretisch_max_m: 23.1,
    begin_stok_afstand_m: 6.33,
    optimale_hoek_graden: 39,
    h_eff_m: 6,
  });

  // The briefing target (21.93 m / 47 degrees) is intentionally NOT met by
  // this approximation. Update this fixture after replacing it with the Excel formulas.
});

test('berekenSprongMax returns null for non-positive effective height', () => {
  assert.equal(berekenSprongMax(5.7, FYSICA_DEFAULTS), null);
  assert.equal(berekenSprongMax(4.7, FYSICA_DEFAULTS), null);
});

test('berekenSprongMax returns null when effective height is not finite', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(berekenSprongMax(value, FYSICA_DEFAULTS), null);
  }
});

test('berekenSprongMax theoretical maximum grows with pole depth and impulse', () => {
  const baseline = berekenSprongMax(11.7, FYSICA_DEFAULTS);
  assert.ok(berekenSprongMax(12.7, FYSICA_DEFAULTS).theoretisch_max_m > baseline.theoretisch_max_m);
  const strongerImpulse = { ...FYSICA_DEFAULTS, uitsprongstoot_ns: 150 };
  assert.ok(berekenSprongMax(11.7, strongerImpulse).theoretisch_max_m > baseline.theoretisch_max_m);
});

test('berekenSprongMax reports effective height and bounded precision', () => {
  const config = { ...FYSICA_DEFAULTS, waterdiepte_m: 1.73, schanshoogte_m: 4.02 };
  const result = berekenSprongMax(11.789, config);
  assert.equal(result.h_eff_m, 6.04);
  for (const value of [result.theoretisch_max_m, result.begin_stok_afstand_m, result.h_eff_m]) {
    assert.equal(Math.round(value * 100), value * 100);
  }
  assert.equal(Number.isInteger(result.optimale_hoek_graden), true);
});

test('kompasRichting maps cardinal and intercardinal bearings', () => {
  for (const [degrees, direction] of [[0, 'N'], [90, 'O'], [180, 'Z'], [270, 'W'], [22.5, 'NNO'], [45, 'NO']]) {
    assert.equal(kompasRichting(degrees), direction);
  }
  assert.equal(kompasRichting(348.75), 'N');
  assert.equal(kompasRichting(360), 'N');
  assert.equal(kompasRichting(720), 'N');
  assert.equal(kompasRichting(-90), 'W');
  assert.equal(kompasRichting(11.24), 'N');
  assert.equal(kompasRichting(11.25), 'NNO');
});

test('kompasRichting returns null for missing or non-finite bearings', () => {
  for (const value of [null, undefined, NaN, Infinity]) assert.equal(kompasRichting(value), null);
});

test('benutting calculates percentage to one decimal place', () => {
  assert.equal(benutting(20, 25), 80);
  assert.equal(benutting(21.93, 23.1), 94.9);
  assert.equal(benutting(0, 25), 0);
});

test('benutting handles invalid maxima and non-finite values', () => {
  assert.equal(benutting(1, 0), null);
  assert.equal(benutting(1, -1), null);
  assert.equal(benutting(NaN, 10), null);
  assert.equal(benutting(Infinity, 10), null);
  assert.equal(benutting(1, NaN), null);
  assert.equal(benutting(1, Infinity), null);
});

test('benutting can exceed 100 percent', () => {
  assert.ok(benutting(26, 25) > 100);
});

test('FYSICA_DEFAULTS contains the six current values', () => {
  assert.deepEqual(FYSICA_DEFAULTS, {
    massa_kg: 76.1,
    stoklengte_m: 13.25,
    uitsprongstoot_ns: 120,
    springer_gestrekt_m: 2.25,
    waterdiepte_m: 1.7,
    schanshoogte_m: 4.0,
  });
});
