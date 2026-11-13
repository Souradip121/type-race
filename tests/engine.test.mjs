import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Typist, normalize, MAX_WRONG } from '../assets/js/engine.js';

const CODE = 'def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a';

// Simulate a keyboard: type characters into a field one at a time.
function typeAll(t, text, field = { v: '' }) {
  for (const ch of text) {
    field.v += ch;
    const r = t.feed(field.v);
    if (r.write !== null) field.v = r.write;
  }
  return field;
}

test('typing the code exactly finishes with 100% accuracy', () => {
  const t = new Typist(CODE);
  typeAll(t, 'def gcd(a, b):\nwhile b:\na, b = b, a % b\nreturn a');
  assert.equal(t.finished, true);
  assert.equal(t.progress, t.total);
  assert.equal(t.accuracy, 100);
  assert.equal(t.total, 'def gcd(a, b):\nwhile b:\na, b = b, a % b\nreturn a'.length);
});

test('indentation is filled in: leading spaces the player types are ignored', () => {
  const t = new Typist(CODE);
  typeAll(t, 'def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a');
  assert.equal(t.finished, true);
  assert.equal(t.accuracy, 100);
});

test('a wrong character blocks progress until it is deleted', () => {
  const t = new Typist(CODE);
  const f = typeAll(t, 'dex');
  assert.equal(t.cp, 2);
  assert.equal(t.wrong, 1);
  typeAll(t, ' gcd', f); // keeps going after the mistake: still blocked
  assert.equal(t.cp, 2);
  f.v = f.v.slice(0, 2); // backspace back to the mistake
  t.feed(f.v);
  typeAll(t, 'f gcd(a, b):\n', f);
  assert.equal(t.line, 1);
  assert.ok(t.accuracy < 100);
});

test('wrong characters pile up only to the limit', () => {
  const t = new Typist(CODE);
  const f = typeAll(t, 'xxxxxxxxxxxxxxxx');
  assert.equal(t.wrong, MAX_WRONG);
  assert.equal(f.v.length, MAX_WRONG);
});

test('Enter before the end of a line is a mistake', () => {
  const t = new Typist(CODE);
  typeAll(t, 'def gcd\n');
  assert.equal(t.line, 0);
  assert.equal(t.wrong, 1);
});

test('smart quotes, dashes and ellipses are normalised', () => {
  assert.equal(normalize('\u201Caeiou\u201D'), '"aeiou"');
  assert.equal(normalize('it\u2019s'), "it's");
  assert.equal(normalize('i\u2014'), 'i--');
  assert.equal(normalize('a\u2026'), 'a...');
  assert.equal(normalize('\uFF08x\uFF09'), '(x)');
  assert.equal(normalize('a\u00A0b'), 'a b');
  const t = new Typist('if ch in "aeiou":\n    n += 1\nreturn n\nx = 1');
  typeAll(t, 'if ch in \u201Caeiou\u201D:\nn += 1\n');
  assert.equal(t.line, 2);
});

test('an auto-capitalised first letter is forgiven', () => {
  const t = new Typist(CODE);
  typeAll(t, 'Def gcd(a, b):\nWhile b:\n');
  assert.equal(t.line, 2);
  assert.equal(t.accuracy, 100);
});

test('a phone keyboard that replaces the whole word still counts correctly', () => {
  const t = new Typist(CODE);
  // composition: "d" -> "de" -> "def" (field holds the full word each time)
  for (const v of ['d', 'de', 'def']) t.feed(v, { composing: true });
  assert.equal(t.cp, 3);
  assert.equal(t.keys, 3);
  assert.equal(t.good, 3);
});

test('WPM is characters / 5 per minute', () => {
  const t = new Typist(CODE);
  typeAll(t, 'def gcd(a, b):\nwhile b:\na, b = b, a % b\nreturn a');
  const ms = 30000;
  assert.equal(t.wpm(ms), (t.total / 5) / 0.5);
});
