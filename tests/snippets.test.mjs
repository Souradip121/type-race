import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SNIPPETS, LANGS, typedLength } from '../assets/js/snippets.js';

test('at least 10 snippets per language', () => {
  for (const { id } of LANGS) {
    const n = SNIPPETS.filter((s) => s.lang === id).length;
    assert.ok(n >= 10, `${id} has ${n}`);
  }
});

test('ids are unique and well formed', () => {
  const ids = SNIPPETS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]{3,40}$/);
});

test('every snippet is 4 to 8 lines, ASCII, no tabs, blank lines or trailing spaces', () => {
  for (const s of SNIPPETS) {
    const lines = s.code.split('\n');
    assert.ok(lines.length >= 4 && lines.length <= 8, `${s.id}: ${lines.length} lines`);
    assert.match(s.code, /^[\x20-\x7e\n]+$/, `${s.id}: non-ASCII or tab`);
    for (const l of lines) {
      assert.notEqual(l.trim(), '', `${s.id}: blank line`);
      assert.equal(l, l.trimEnd(), `${s.id}: trailing space`);
    }
  }
});

test('lines fit a phone: at most 40 columns with indentation drawn at half width', () => {
  for (const s of SNIPPETS) {
    for (const l of s.code.split('\n')) {
      const indent = l.length - l.trimStart().length;
      const cols = indent / 2 + l.trimStart().length;
      assert.ok(cols <= 40, `${s.id}: "${l}" is ${cols} columns`);
    }
  }
});

test('typed length matches the database formula', () => {
  // schema.sql: char_length(regexp_replace(code, '(^|\n)[ \t]+', '\1', 'g'))
  for (const s of SNIPPETS) {
    const sqlLike = s.code.replace(/(^|\n)[ \t]+/g, '$1').length;
    assert.equal(typedLength(s.code), sqlLike, s.id);
  }
});
