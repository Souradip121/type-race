// The typing engine. It never trusts what a phone keyboard sends: every input
// event re-reads the whole field, normalises it, and compares it with the line
// being typed.
//
// Rules
//   * Players type one line at a time, without its leading indentation (the
//     app fills that in). Spaces typed at the start of a line are dropped.
//   * Enter ends a line (it is a character, and it counts toward WPM).
//   * A wrong character is shown in red and blocks progress until it is
//     deleted. At most MAX_WRONG wrong characters pile up; more are refused.
//   * Smart quotes, dashes, ellipses, non-breaking and full-width characters
//     are turned back into plain ASCII. A capital letter the keyboard added at
//     the start of a line is forgiven when the code has the lowercase letter.
//   * Accuracy = correct keystrokes / all keystrokes (fixed mistakes still count).
//   * WPM = (characters typed / 5) per minute.
import { typedLines, typedLength } from './snippets.js';

export const MAX_WRONG = 8;

const MAP = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", 'ʼ': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"', '″': '"',
  '—': '--', '–': '-', '−': '-', '‐': '-', '‑': '-',
  '…': '...',
  ' ': ' ', ' ': ' ', ' ': ' ', '　': ' ', ' ': ' ',
  '​': '', '‌': '', '‍': '', '﻿': '', '\r': '', '\t': '',
};

export function normalize(raw) {
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (ch in MAP) out += MAP[ch];
    else if (code >= 0xff01 && code <= 0xff5e) out += String.fromCodePoint(code - 0xfee0); // full-width ASCII
    else out += ch;
  }
  return out;
}

function prefix(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

export class Typist {
  constructor(code) {
    this.lines = typedLines(code);
    this.total = typedLength(code);
    this.line = 0;      // index of the line being typed
    this.done = 0;      // characters finished on earlier lines (each Enter included)
    this.typed = '';    // normalised input for the current line
    this.cp = 0;        // how much of the current line is correct
    this.keys = 0;      // keystrokes that added a character
    this.good = 0;      // ...that were correct when typed
    this.finished = false;
  }

  target(i = this.line) {
    const t = this.lines[i].text;
    return i < this.lines.length - 1 ? `${t}\n` : t;
  }

  get progress() { return this.done + this.cp; }
  get wrong() { return this.typed.length - this.cp; }
  get accuracy() { return this.keys ? (this.good / this.keys) * 100 : 100; }

  // What the field should hold for the current line, after cleaning.
  clean(raw) {
    const tgt = this.target();
    let t = normalize(raw).replace(/^ +/, '');
    if (t && tgt && t[0] !== tgt[0] && t[0].toLowerCase() === tgt[0] && /[A-Z]/.test(t[0])) {
      t = tgt[0] + t.slice(1); // keyboard auto-capitalised the first letter
    }
    return t;
  }

  // Feed the field's current value. Returns { write } where write is the value
  // to put back in the field (or null to leave it alone), plus flags.
  feed(raw, { composing = false } = {}) {
    if (this.finished) return { write: null };
    let typed = this.clean(raw);
    const tgt = this.target();
    let cp = prefix(typed, tgt);
    let write = typed !== raw && !composing ? typed : null;
    let refused = false;

    if (typed.length - cp > MAX_WRONG) {
      typed = typed.slice(0, cp + MAX_WRONG);
      refused = true;
      if (!composing) write = typed;
    }

    const p = prefix(this.typed, typed);
    this.keys += Math.max(0, typed.length - p);
    this.good += Math.max(0, cp - p);
    this.typed = typed;
    this.cp = cp;

    let advanced = false;
    while (this.cp === this.target().length) {
      if (this.line === this.lines.length - 1) {
        this.finished = true;
        break;
      }
      const leftover = this.typed.slice(this.target().length);
      this.done += this.target().length;
      this.line++;
      advanced = true;
      this.typed = this.clean(leftover);
      this.cp = prefix(this.typed, this.target());
      this.good += this.cp; // leftover keystrokes were counted in keys above
      write = this.typed;
    }
    return { write, advanced, refused, finished: this.finished };
  }

  wpm(ms) {
    return ms > 0 ? (this.progress / 5) / (ms / 60000) : 0;
  }
}
