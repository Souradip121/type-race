// Type Race: routes, lobby, race, results, solo practice.
import { LANGS, SNIPPETS, typedLines, forLang } from './snippets.js';
import {
  CARS, carSVG, avatarSVG, flagSVG, trophySVG, crownSVG, boltSVG, sightSVG, sparkSVG, iconSVG,
  installFrames, AVATAR_COUNT, numSVG, wordmarkSVG,
} from './sprites.js';
import { Typist } from './engine.js';
import { rpc, serverNow, joinChannel, leaveBeacon } from './net.js';
import { shareResult } from './share.js';

installFrames();

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LANG_IDS = LANGS.map((l) => l.id);
const langLabel = (id) => (LANGS.find((l) => l.id === id) || {}).label || id;
const ordinal = (n) => `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n] || 'th'}`;
const round = (n) => Math.round(Number(n) || 0);
const inkFlag = () => flagSVG('', true);
const isMobile = matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- storage
const memory = {};
const store = {
  get(k, d) {
    try { const v = localStorage.getItem(`typerace.${k}`); return v === null ? (k in memory ? memory[k] : d) : JSON.parse(v); } catch { return k in memory ? memory[k] : d; }
  },
  set(k, v) { memory[k] = v; try { localStorage.setItem(`typerace.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
function token() {
  let t = store.get('token', null);
  if (typeof t !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) {
    const b = crypto.getRandomValues(new Uint8Array(24));
    t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    store.set('token', t);
  }
  return t;
}
function myAvatar() {
  let a = store.get('avatar', null);
  if (!Number.isInteger(a) || a < 0 || a >= AVATAR_COUNT) { a = Math.floor(Math.random() * AVATAR_COUNT); store.set('avatar', a); }
  return a;
}

const ERR = {
  room_not_found: 'That room doesn’t exist or has expired. Rooms last 24 hours.',
  room_full: 'This room is full (6 racers). Make your own room, or wait for someone to leave.',
  name_required: 'Type your name first.',
  name_too_long: 'Names can be up to 14 characters.',
  room_name_required: 'Give the room a name, like your class.',
  room_name_too_long: 'Room names can be up to 16 characters.',
  race_running: 'Wait for this race to finish.',
  impossible_score: 'That finish was faster than 250 WPM, so it was not counted.',
  race_over: 'The race closed 3 minutes after the start.',
  offline: 'No connection. Check your internet and try again.',
  not_configured: 'This copy has no Supabase project yet. See config.js.',
};
const errText = (e) => ERR[e && e.message] || 'Something went wrong. Try again.';

function toast(text) {
  $$('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// Focus a hidden field inside a tap, so a phone keyboard is already up when the race screen asks for it.
function primeKeyboard() {
  if (!isMobile) return;
  try { $('#primer').focus({ preventScroll: true }); } catch { /* ignore */ }
}

const roomLink = (code) => `${location.origin}${location.pathname}#/r/${code}`;
async function invite(code, name) {
  const url = roomLink(code);
  const text = `Race me on Type Race (room ${name}). Real code, not English.`;
  if (navigator.share && isMobile) {
    try { await navigator.share({ title: 'Type Race', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { window.prompt('Copy this link', url); }
}

// ---------------------------------------------------------------- syntax colours
const KW = {
  python: { d: ['def', 'class', 'lambda'], k: ['return', 'if', 'elif', 'else', 'for', 'while', 'in', 'and', 'or', 'not', 'is', 'None', 'True', 'False', 'pass', 'break', 'continue'] },
  c: { d: ['int', 'long', 'void', 'char', 'const', 'struct', 'Node', 'unsigned', 'double', 'float'], k: ['return', 'if', 'else', 'for', 'while', 'NULL', 'sizeof', 'break', 'continue'] },
  java: { d: ['int', 'long', 'void', 'boolean', 'char', 'String', 'Node', 'static'], k: ['return', 'if', 'else', 'for', 'while', 'new', 'null', 'true', 'false', 'break', 'continue'] },
};
function syntax(lang, text) {
  const cls = new Array(text.length).fill('');
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|([^\sA-Za-z_\d])/g;
  const kw = KW[lang] || KW.python;
  let m;
  while ((m = re.exec(text))) {
    let c = 'p';
    if (m[1]) c = 's';
    else if (m[2]) c = 'n';
    else if (m[3]) c = kw.d.includes(m[3]) ? 'd' : kw.k.includes(m[3]) ? 'k' : '';
    for (let i = m.index; i < m.index + m[0].length; i++) cls[i] = c;
  }
  return cls;
}

// ---------------------------------------------------------------- shared bits
const header = ({ back = null, backLabel = 'Back' } = {}) => `
  <header class="mast${back ? ' has-back' : ''}">
    ${back ? `<a class="back" href="${back}" aria-label="${esc(backLabel)}">${iconSVG('back')}</a>` : ''}
    <h1 class="logo">${flagSVG()}${wordmarkSVG()}${flagSVG()}</h1>
    ${back ? '<span aria-hidden="true"></span>' : ''}
  </header>`;

const chipsHTML = (sel, disabled = false) => LANGS.map((l) => `
  <button type="button" class="fr chip" role="radio" data-lang="${l.id}" aria-checked="${l.id === sel}" ${disabled ? 'disabled' : ''}>${l.label}</button>`).join('');

const laneHTML = (r) => `
  <li class="lane${r.me ? ' me' : ''}${r.ghost ? ' ghost' : ''}" data-id="${esc(r.id)}" style="--trail:${CARS[r.car % CARS.length].trail};--p:${r.p || 0}">
    <span class="fr av sm">${avatarSVG(r.avatar)}</span>
    <div class="track">
      <div class="who"><span>${esc(r.name)}</span><small>${esc(r.note || '')}</small></div>
      <div class="road"><span class="rider"><i class="trail"></i>${carSVG(r.car)}</span></div>
    </div>
  </li>`;

function loadingHTML(text = 'Warming up the engines') {
  return `<section class="screen">${header()}<div class="loading">${carSVG(0)}<span>${esc(text)}</span></div></section>`;
}

// ---------------------------------------------------------------- the race screen (online and solo)
let activeRace = null;
function raceScreen({ snippet, lanes, meId, startPerf, onFinish, onProgress }) {
  const t = new Typist(snippet.code);
  const lines = typedLines(snippet.code);
  const syn = lines.map((l) => syntax(snippet.lang, l.text));
  const ENTER = iconSVG('enter');
  const CROSS = iconSVG('cross');
  let started = false;
  let stopped = false;
  let composing = false;
  let lastSent = 0;
  let sendTimer = null;
  let shownCount = null;
  let goUntil = 0;
  let painted = -1;
  let shownW = 0;
  let shownA = 100;

  const runs = (i) => {
    const text = lines[i].text;
    const s = syn[i];
    let h = '';
    let j = 0;
    while (j < text.length) {
      let k = j + 1;
      while (k < text.length && s[k] === s[j]) k++;
      h += `<span class="${s[j]}">${esc(text.slice(j, k))}</span>`;
      j = k;
    }
    return h;
  };
  const lineHTML = (i, state) => {
    const l = lines[i];
    let h = `<span class="ind" style="width:${l.indent * 0.5}ch"></span><span class="tx">`;
    if (state !== 'cur') return `${h}${runs(i)}</span>`;
    const typedLen = t.typed.length;
    const cp = t.cp;
    const s = syn[i];
    for (let j = 0; j < l.text.length; j++) {
      const st = j < cp ? 't' : j < typedLen ? 'bad' : j === typedLen ? 'nx' : 'u';
      h += `<span class="${s[j]} ${st}">${esc(l.text[j])}</span>`;
    }
    if (i < lines.length - 1) {
      const n = l.text.length;
      const st = n < cp ? 't' : n < typedLen ? 'bad' : n === typedLen ? 'nx' : 'u';
      h += `<span class="eol ${st}" title="Enter">${ENTER}</span>`;
    }
    h += '</span>';
    if (t.wrong > 0) h += `<span class="x" aria-hidden="true">${CROSS}</span>`;
    return h;
  };

  const longest = Math.max(...lines.map((l) => l.indent * 0.5 + l.text.length + 2));
  view.innerHTML = `
  <section class="screen screen-race">
    <header class="mast race-mast">
      <h1 class="logo">${wordmarkSVG()}</h1>
      <span class="clock">${flagSVG()}<span class="t">00:00</span></span>
    </header>
    <section class="fr code-card" style="--cols:${longest}">
      <p class="code-title"><span>${esc(langLabel(snippet.lang))} · ${esc(snippet.title)}</span><span class="pos">1 / ${lines.length}</span></p>
      <pre class="code" aria-hidden="true">${lines.map((_, i) => `<span class="ln todo" data-i="${i}">${lineHTML(i, 'todo')}</span>`).join('')}</pre>
      <p class="sr" aria-live="polite" id="sr-line"></p>
      <textarea class="typer" aria-label="Type the code here, one line at a time. Indentation is filled in for you."
        autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text"
        enterkeyhint="enter" data-gramm="false" data-enable-grammarly="false" writingsuggestions="false" rows="1"></textarea>
      <span class="tap-hint">${iconSVG('keyboard')}Tap here to type</span>
    </section>
    <section class="fr stats" aria-label="Your speed">
      <div class="stat">${boltSVG()}<div><b class="wpm-n">${numSVG(0)}</b><small>WPM</small></div></div>
      <span class="sep"></span>
      <div class="stat">${sightSVG()}<div><b class="acc-n">${numSVG('100%')}</b><small>accuracy</small></div></div>
    </section>
    <ol class="lanes">${lanes.map(laneHTML).join('')}</ol>
    <div class="countdown" hidden><b></b></div>
  </section>`;

  const root = $('.screen-race');
  const card = $('.code-card', root);
  const typer = $('.typer', root);
  const pre = $('.code', root);
  const cd = $('.countdown', root);
  const clock = $('.clock .t', root);
  const wpmEl = $('.wpm-n', root);
  const accEl = $('.acc-n', root);
  const pos = $('.pos', root);

  // fit the longest line on the card
  const fit = () => {
    const w = pre.clientWidth;
    if (!w) return;
    const size = Math.max(11.5, Math.min(16, w / (longest * 0.6)));
    card.style.setProperty('--code-size', `${size.toFixed(2)}px`);
  };
  fit();

  const paint = () => {
    if (painted !== t.line) {
      $$('.ln', pre).forEach((el) => {
        const i = Number(el.dataset.i);
        const state = i < t.line || t.finished ? 'done' : i === t.line ? 'cur' : 'todo';
        if (el.dataset.state !== state || state === 'cur') {
          el.className = `ln ${state}`;
          el.dataset.state = state;
          el.innerHTML = lineHTML(i, state === 'cur' && !t.finished ? 'cur' : state);
        }
      });
      painted = t.line;
      pos.textContent = `${Math.min(t.line + 1, lines.length)} / ${lines.length}`;
      $('#sr-line').textContent = t.finished ? 'Finished' : `Line ${t.line + 1}: ${lines[t.line].text}`;
    } else if (!t.finished) {
      const el = pre.children[t.line];
      el.innerHTML = lineHTML(t.line, 'cur');
    }
    card.classList.toggle('has-wrong', t.wrong > 0);
  };

  const setLane = (id, p, note) => {
    const el = root.querySelector(`.lane[data-id="${CSS.escape(String(id))}"]`);
    if (!el) return;
    el.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(4));
    if (note !== undefined) $('.who small', el).textContent = note;
  };

  const elapsed = () => Math.max(0, performance.now() - startPerf);
  const send = () => {
    lastSent = performance.now();
    sendTimer = null;
    onProgress && onProgress({ c: t.progress, n: t.total, w: round(t.wpm(elapsed())) });
  };
  const queueSend = () => {
    if (!onProgress || sendTimer) return;
    const wait = Math.max(0, 160 - (performance.now() - lastSent));
    sendTimer = setTimeout(send, wait);
  };

  const shake = () => { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); };
  const finish = () => {
    stopped = true;
    const ms = Math.round(elapsed());
    setLane(meId, 1);
    clearTimeout(sendTimer);
    send();
    typer.blur();
    onFinish({ ms, wpm: t.wpm(ms), accuracy: t.accuracy, typist: t });
  };
  const onInput = () => {
    if (stopped) return;
    if (!started) { typer.value = ''; return; }
    const r = t.feed(typer.value, { composing });
    if (r.write !== null && typer.value !== r.write) typer.value = r.write;
    if (r.refused) shake();
    paint();
    setLane(meId, t.progress / t.total);
    if (r.finished) finish();
    else queueSend();
  };
  typer.addEventListener('compositionstart', () => { composing = true; });
  typer.addEventListener('compositionend', () => { composing = false; onInput(); });
  typer.addEventListener('input', onInput);
  typer.addEventListener('keydown', (e) => { if (e.key === 'Tab') e.preventDefault(); });
  typer.addEventListener('beforeinput', (e) => {
    if (/^insertFrom(Paste|Drop)/.test(e.inputType)) e.preventDefault();
  });
  typer.addEventListener('paste', (e) => e.preventDefault());
  typer.addEventListener('drop', (e) => e.preventDefault());
  const focusState = () => card.classList.toggle('needs-focus', document.activeElement !== typer && !stopped);
  typer.addEventListener('focus', focusState);
  typer.addEventListener('blur', focusState);
  const keyAnywhere = (e) => {
    if (stopped || document.activeElement === typer || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') typer.focus({ preventScroll: true });
  };
  document.addEventListener('keydown', keyAnywhere, true);

  // keyboard-open layout
  const vv = window.visualViewport;
  const onVV = () => {
    const h = vv ? vv.height : innerHeight;
    root.classList.toggle('tight', h < 640 && isMobile);
    fit();
  };
  if (vv) vv.addEventListener('resize', onVV);
  addEventListener('resize', onVV);
  onVV();

  try { typer.focus({ preventScroll: true }); } catch { /* ignore */ }
  focusState();
  paint();

  const controller = {
    setLane,
    get typist() { return t; },
    get started() { return started; },
    elapsed,
    onTick: null,
    destroy() {
      stopped = true;
      clearInterval(controller.iv);
      clearTimeout(sendTimer);
      document.removeEventListener('keydown', keyAnywhere, true);
      if (vv) vv.removeEventListener('resize', onVV);
      removeEventListener('resize', onVV);
    },
  };
  if (activeRace) activeRace.destroy();
  activeRace = controller;

  const tick = () => {
    if (!root.isConnected) return;
    const rem = startPerf - performance.now();
    if (rem > 0) {
      const n = rem > 3000 ? 'Ready' : String(Math.ceil(rem / 1000));
      if (n !== shownCount) {
        shownCount = n;
        cd.hidden = false;
        cd.innerHTML = n === 'Ready' ? '<b class="go">Ready</b>' : `<b aria-label="${n}">${numSVG(n)}</b>`;
      }
    } else if (!started) {
      started = true;
      goUntil = performance.now() + 700;
      cd.innerHTML = '<b class="go">GO!</b>';
      typer.value = '';
      paint();
    } else if (goUntil && performance.now() > goUntil) {
      cd.hidden = true;
      goUntil = 0;
    }
    if (started && !stopped) {
      const ms = elapsed();
      const s = Math.floor(ms / 1000);
      clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      const w = ms > 1500 ? round(t.wpm(ms)) : 0;
      if (w !== shownW) { shownW = w; wpmEl.innerHTML = numSVG(w); }
      const a = round(t.accuracy);
      if (a !== shownA) { shownA = a; accEl.innerHTML = numSVG(`${a}%`); }
      controller.onTick && controller.onTick(ms);
    }
  };
  controller.iv = setInterval(tick, 100);
  tick();
  return controller;
}

// ---------------------------------------------------------------- home
function showHome() {
  teardown();
  const name = store.get('name', '');
  let lang = store.get('lang', 'python');
  if (!LANG_IDS.includes(lang)) lang = 'python';
  const demo = [0, 1, 2].map((car) => ({ id: `d${car}`, name: '', car, avatar: car }));
  view.innerHTML = `
  <section class="screen screen-home">
    ${header()}
    <p class="tagline">Don’t brag about your typing speed. <b>Prove it.</b></p>
    <div class="hero-road" aria-hidden="true">
      <ol class="lanes">${demo.map((d) => laneHTML(d).replace('<span class="fr av sm">', '<span class="fr av sm" hidden>').replace('<div class="who">', '<div class="who" hidden>')).join('')}</ol>
    </div>
    <form class="fr form-card" id="make" novalidate>
      <div>
        <label class="field-label" for="f-name">Your name</label>
        <input class="fr field" id="f-name" maxlength="14" autocomplete="nickname" autocapitalize="words" spellcheck="false" value="${esc(name)}" placeholder="Riya">
      </div>
      <div>
        <label class="field-label" for="f-room">Room name</label>
        <input class="fr field" id="f-room" maxlength="16" autocapitalize="characters" spellcheck="false" placeholder="CSE-B" value="${esc(store.get('roomName', ''))}">
      </div>
      <div>
        <span class="field-label" id="f-lang">Language</span>
        <div class="chips" role="radiogroup" aria-labelledby="f-lang">${chipsHTML(lang)}</div>
      </div>
      <p class="notice red fr" id="f-err" hidden></p>
      <button class="btn btn-yellow" type="submit">${inkFlag()}Make a room${inkFlag()}</button>
    </form>
    <button class="btn btn-outline solo-btn" type="button" id="solo">${iconSVG('play')}Practise solo</button>
    <div class="or">or join with a code</div>
    <form class="join-row" id="join" novalidate>
      <label class="sr" for="f-code">Room code</label>
      <input class="fr field code-in" id="f-code" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="5-letter code">
      <button class="btn btn-outline" type="submit">Join</button>
    </form>
    <p class="fineprint">Real code: C, Python or Java, 4 to 8 lines. Indents are typed for you. WPM is characters ÷ 5 per minute. Up to 6 racers per room; rooms vanish after 24 hours. No sign-up.</p>
    <footer class="foot">Made by <a href="https://www.instagram.com/souradip.sh/" rel="noopener">@souradip.sh</a> · <a href="https://github.com/Souradip121/type-race" rel="noopener">open source</a></footer>
  </section>`;

  $$('.chip', view).forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang;
    store.set('lang', lang);
    $$('.chip', view).forEach((c) => c.setAttribute('aria-checked', String(c === b)));
  }));
  const err = $('#f-err');
  $('#make').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nm = $('#f-name').value.trim();
    const room = $('#f-room').value.trim();
    const fail = (msg, field) => { err.textContent = msg; err.hidden = false; field && field.focus(); };
    if (!nm) return fail(ERR.name_required, $('#f-name'));
    if (!room) return fail(ERR.room_name_required, $('#f-room'));
    err.hidden = true;
    const btn = e.submitter || $('#make .btn');
    btn.disabled = true;
    store.set('name', nm);
    store.set('roomName', room);
    try {
      const s = await rpc('tr_create_room', { p_token: token(), p_room_name: room, p_player_name: nm, p_lang: lang, p_avatar: myAvatar() });
      pendingState = s;
      location.hash = `#/r/${s.room.code}`;
    } catch (ex) {
      btn.disabled = false;
      fail(errText(ex));
    }
  });
  $('#join').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = $('#f-code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const nm = $('#f-name').value.trim();
    if (nm) store.set('name', nm);
    if (!/^[A-Z2-9]{5}$/.test(c)) { toast('Room codes have 5 letters or digits'); $('#f-code').focus(); return; }
    location.hash = `#/r/${c}`;
  });
  $('#solo').addEventListener('click', () => {
    const nm = $('#f-name').value.trim();
    if (nm) store.set('name', nm);
    primeKeyboard();
    location.hash = `#/solo/${lang}`;
  });
}

// ---------------------------------------------------------------- solo practice
function pickSnippet(lang) {
  const pool = forLang(lang);
  const last = store.get('lastSolo', '');
  const options = pool.filter((s) => s.id !== last);
  const s = options[Math.floor(Math.random() * options.length)] || pool[0];
  store.set('lastSolo', s.id);
  return s;
}

function runSolo({ lang, inRoom = null }) {
  const best = store.get('best', {});
  const pb = best[lang];
  const pace = pb ? pb.wpm : 35;
  const snippet = pickSnippet(lang);
  const lanes = [
    { id: 'me', name: 'You', car: 0, avatar: myAvatar(), me: true },
    { id: 'ghost', name: pb ? 'Your best' : 'Pace car', note: `${round(pace)} WPM`, car: pb ? 0 : 3, avatar: myAvatar(), ghost: true },
  ];
  const ctl = raceScreen({
    snippet, lanes, meId: 'me', startPerf: performance.now() + 3200,
    onFinish: (res) => {
      const prev = store.get('best', {});
      const fair = res.wpm <= 250;
      const isBest = fair && (!prev[lang] || res.wpm > prev[lang].wpm);
      if (isBest) { prev[lang] = { wpm: Math.round(res.wpm * 10) / 10, acc: Math.round(res.accuracy * 10) / 10, at: Date.now() }; store.set('best', prev); }
      ctl.destroy();
      soloResults({ lang, snippet, res, isBest, fair, prevBest: pb, inRoom });
    },
  });
  const total = ctl.typist.total;
  ctl.onTick = (ms) => ctl.setLane('ghost', ((ms / 60000) * pace * 5) / total);
  return ctl;
}

function soloResults({ lang, snippet, res, isBest, fair, prevBest, inRoom }) {
  const best = store.get('best', {})[lang];
  view.innerHTML = `
  <section class="screen screen-results">
    ${header({ back: inRoom ? null : '#/', backLabel: 'Home' })}
    <section class="fr result-card">
      <div class="trophy-wrap">${isBest ? `${trophySVG()}${sparkSVG('a')}${sparkSVG('b')}${sparkSVG('c')}${sparkSVG('d')}` : carSVG(0)}</div>
      <div class="big-wpm">${numSVG(round(res.wpm))}</div>
      <div class="big-unit">WPM</div>
      <div class="ribbon-row">${flagSVG()}<span class="ribbon ${!fair ? 'red' : isBest ? 'yellow' : ''}">${!fair ? 'Not counted' : isBest ? (prevBest ? 'New best!' : 'First run!') : 'Practice'}</span>${flagSVG()}</div>
      <div class="rule"></div>
      <div class="acc-row">${sightSVG()}<div><b>${numSVG(`${round(res.accuracy)}%`)}</b><small>accuracy</small></div></div>
      <p class="result-sub">${esc(langLabel(lang))} · ${esc(snippet.title)}</p>
    </section>
    ${best ? `<div class="fr solo-best">${carSVG(0)}<span>Your best in ${esc(langLabel(lang))}: <b>${round(best.wpm)} WPM</b>${isBest && prevBest ? ` (was ${round(prevBest.wpm)})` : ''}</span></div>` : ''}
    <div class="actions">
      <button class="btn btn-yellow" id="again">${iconSVG('rematch')}Again</button>
      <button class="btn btn-outline" id="share">${iconSVG('share')}Share</button>
      ${inRoom ? '<button class="link-btn" id="lobby" type="button">Back to the room</button>' : '<a class="link-btn" href="#/" style="text-align:center">Race your classmates</a>'}
    </div>
  </section>`;
  $('#again').addEventListener('click', () => {
    primeKeyboard();
    if (inRoom) { R.solo = runSolo({ lang, inRoom }); } else runSolo({ lang });
  });
  $('#share').addEventListener('click', () => shareResult({
    wpm: res.wpm, accuracy: res.accuracy, lang, title: snippet.title, solo: true, best: isBest,
    name: store.get('name', ''), avatar: myAvatar(),
  }).catch(() => toast('Couldn’t make the image')));
  if (inRoom) $('#lobby').addEventListener('click', () => { R.solo = null; R.view = null; apply(R.state); });
}

// ---------------------------------------------------------------- rooms
let R = null;               // the open room
let pendingState = null;    // state handed over by "Make a room"

function teardown() {
  if (!R) return;
  const r = R;
  R = null;
  clearInterval(r.poll);
  r.chan && r.chan.close();
  r.race && r.race.destroy();
  r.solo && r.solo.destroy && r.solo.destroy();
  removeEventListener('pagehide', r.onHide);
  document.removeEventListener('visibilitychange', r.onVis);
  if (r.state && r.state.me) rpc('tr_leave', { p_code: r.code, p_token: token() }).catch(() => {});
}

function openRoom(code) {
  teardown();
  R = {
    code, state: null, view: null, race: null, raceId: null, solo: null, dismissed: null,
    localDone: null, local: null, finishErr: null, progress: new Map(), joining: false, joinErr: null, busy: false, again: false,
  };
  const r = R;
  view.innerHTML = loadingHTML('Finding the room');
  r.chan = joinChannel(code, {
    onSync: () => refresh(),
    onProgress: (m) => {
      if (!R || !m || !m.id || !m.r) return;
      R.progress.set(m.id, m);
      if (R.race && R.raceId === m.r) R.race.setLane(m.id, m.c / (m.n || 1));
    },
  });
  r.poll = setInterval(() => refresh(), 4000);
  r.onHide = () => { if (R && R.state && R.state.me) leaveBeacon(R.code, token()); };
  r.onVis = () => { if (document.visibilityState === 'visible') refresh(); };
  addEventListener('pagehide', r.onHide);
  document.addEventListener('visibilitychange', r.onVis);
  if (pendingState && pendingState.room && pendingState.room.code === code) {
    const s = pendingState;
    pendingState = null;
    apply(s);
  } else {
    refresh();
  }
}

async function refresh() {
  const r = R;
  if (!r) return;
  if (r.busy) { r.again = true; return; }
  r.busy = true;
  try {
    const s = await rpc('tr_state', { p_code: r.code, p_token: token() });
    if (r === R) apply(s);
  } catch (e) {
    if (r !== R) return;
    if (e.message === 'room_not_found') { showMissing(); return; }
    if (!r.state) view.innerHTML = `<section class="screen">${header({ back: '#/' })}<p class="notice red fr">${esc(errText(e))}</p><div class="actions"><button class="btn btn-outline" id="retry">Try again</button></div></section>`;
    const b = $('#retry'); if (b) b.addEventListener('click', () => refresh());
  } finally {
    r.busy = false;
    if (r.again && r === R) { r.again = false; refresh(); }
  }
}

function showMissing() {
  const code = R && R.code;
  teardown();
  view.innerHTML = `
  <section class="screen">
    ${header({ back: '#/' })}
    <section class="fr result-card">
      <div class="trophy-wrap">${carSVG(3)}</div>
      <p class="tagline" style="margin:14px 0 6px">No room called ${esc(code || '')}</p>
      <p class="result-sub">${esc(ERR.room_not_found)}</p>
    </section>
    <div class="actions"><a class="btn btn-yellow" href="#/">${inkFlag()}Make a room${inkFlag()}</a></div>
  </section>`;
}

async function joinRoom(name) {
  if (!R || R.joining) return;
  R.joining = true;
  const r = R;
  try {
    const s = await rpc('tr_join', { p_code: r.code, p_token: token(), p_name: name, p_avatar: myAvatar() });
    r.joinErr = null;
    if (r === R) apply(s);
  } catch (e) {
    r.joinErr = e.message;
    if (r === R) { if (r.state) apply(r.state); else toast(errText(e)); }
  } finally {
    r.joining = false;
  }
}

function myEntry(s) {
  return s && s.race && s.me ? s.race.entries.find((e) => e.player_id === s.me) : null;
}

function decideView(s) {
  const race = s.race;
  const mine = myEntry(s);
  if (mine && race) {
    const finished = mine.place != null || R.localDone === race.id;
    if (!finished && !race.over) return 'race';
    if (R.dismissed !== race.id) return 'results';
  }
  if (R.solo) return 'solo';
  return 'lobby';
}

function apply(s) {
  if (!R || !s || !s.room) return;
  // Opening a room whose last race already ended lands in the lobby, not on old results.
  if (!R.state && s.race && s.race.over) R.dismissed = s.race.id;
  R.state = s;
  if (!s.me && !R.joining && !R.joinErr) {
    const name = store.get('name', '');
    if (name) joinRoom(name);
  }
  const v = decideView(s);
  if (v === 'race' && R.solo) { R.solo.destroy && R.solo.destroy(); R.solo = null; }
  if (v !== R.view || (v === 'race' && R.raceId !== s.race.id)) {
    if (R.race && (v !== 'race' || R.raceId !== s.race.id)) { R.race.destroy(); R.race = null; }
    R.view = v;
    if (v === 'race') renderRace(s);
    else if (v === 'results') renderResults(s);
    else if (v === 'lobby') renderLobby(s);
  } else if (v === 'race') updateRace(s);
  else if (v === 'results') renderResults(s);
  else if (v === 'lobby') updateLobby(s);
}

// ---------------------------------------------------------------- lobby
function renderLobby(s) {
  view.innerHTML = `
  <section class="screen screen-lobby">
    ${header({ back: '#/', backLabel: 'Leave room' })}
    <section class="fr room-card">
      <span class="k">Room</span>
      <div class="room-name">${esc(s.room.name)}</div>
      <div class="room-meta">
        <span class="room-code">Code <b>${esc(s.room.code)}</b></span>
        <button class="fr invite" type="button" id="invite">${iconSVG('link')}Invite</button>
      </div>
    </section>
    <h2 class="label" id="l-lang">Language</h2>
    <div class="chips" role="radiogroup" aria-labelledby="l-lang" id="chips"></div>
    <h2 class="label">Racers <span class="count" id="count"></span></h2>
    <ul class="racers" id="racers"></ul>
    <div id="joinbox"></div>
    <div class="start-wrap" id="startbox"></div>
  </section>`;
  $('#invite').addEventListener('click', () => invite(s.room.code, R.state.room.name));
  R.racerIds = new Set();
  updateLobby(s);
}

function updateLobby(s) {
  if (!$('.screen-lobby')) return renderLobby(s);
  const me = s.me;
  const race = s.race;
  const running = race && !race.over;
  const players = [...s.players].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));

  $('#chips').innerHTML = chipsHTML(s.room.lang, !me || running);
  $$('#chips .chip').forEach((b) => b.addEventListener('click', async () => {
    if (b.getAttribute('aria-checked') === 'true') return;
    $$('#chips .chip').forEach((c) => c.setAttribute('aria-checked', String(c === b)));
    store.set('lang', b.dataset.lang);
    try { apply(await rpc('tr_set_lang', { p_code: R.code, p_token: token(), p_lang: b.dataset.lang })); } catch (e) { toast(errText(e)); refresh(); }
  }));

  $('#count').textContent = `${players.length} / 6`;
  const seen = R.racerIds || new Set();
  let html = players.map((p) => `
    <li class="fr racer${seen.has(p.id) ? '' : ' enter'}" data-id="${p.id}">
      ${p.id === me
        ? `<button class="fr av" type="button" id="me-av" aria-label="Change your avatar">${avatarSVG(p.avatar)}</button>`
        : `<span class="fr av">${avatarSVG(p.avatar)}</span>`}
      <span class="nm">${p.id === me ? 'You' : esc(p.name)}${p.id === me ? `<small>${esc(p.name)}</small>` : ''}</span>
      ${carSVG(p.car, { title: `${CARS[p.car].name} car` })}
    </li>`).join('');
  if (players.length < 2) html += '<li class="fr racer waiting">Waiting for classmates. Send them the link with Invite.</li>';
  $('#racers').innerHTML = html;
  R.racerIds = new Set(players.map((p) => p.id));
  const av = $('#me-av');
  if (av) av.addEventListener('click', () => {
    const a = (myAvatar() + 1) % AVATAR_COUNT;
    store.set('avatar', a);
    av.innerHTML = avatarSVG(a);
    const nm = (s.players.find((p) => p.id === me) || {}).name || store.get('name', 'Racer');
    clearTimeout(R.avTimer);
    R.avTimer = setTimeout(() => joinRoom(nm), 400);
  });

  // not in the room yet: name + join
  const jb = $('#joinbox');
  if (!me) {
    if (!$('#j-name')) {
      jb.innerHTML = `
      <form class="fr join-card" id="jform" novalidate>
        <div><label class="field-label" for="j-name">Your name</label>
        <input class="fr field" id="j-name" maxlength="14" autocomplete="nickname" autocapitalize="words" spellcheck="false" placeholder="Arjun" value="${esc(store.get('name', ''))}"></div>
        <p class="notice red fr" id="j-err" hidden></p>
        <button class="btn btn-yellow" type="submit">${inkFlag()}Join race${inkFlag()}</button>
      </form>`;
      $('#jform').addEventListener('submit', (e) => {
        e.preventDefault();
        const nm = $('#j-name').value.trim();
        if (!nm) { $('#j-err').textContent = ERR.name_required; $('#j-err').hidden = false; return; }
        store.set('name', nm);
        R.joinErr = null;
        joinRoom(nm);
      });
    }
    const je = $('#j-err');
    if (R.joinErr && je) { je.textContent = errText({ message: R.joinErr }); je.hidden = false; }
    $('#startbox').innerHTML = '';
    return;
  }
  jb.innerHTML = '';

  const sb = $('#startbox');
  let startHTML;
  if (running) {
    startHTML = `<button class="btn btn-yellow" disabled>${inkFlag()}Race on${inkFlag()}</button>
      <p class="start-hint note">A race started before you joined. You’re in the next one.</p>`;
  } else if (players.length < 2) {
    startHTML = `<button class="btn btn-yellow" id="go-solo">${iconSVG('play', 'currentColor')}Practise solo</button>
      <p class="start-hint note">Start unlocks when a classmate joins. Practise while you wait.</p>`;
  } else {
    startHTML = `<button class="btn btn-yellow" id="go">${inkFlag()}Start${inkFlag()}</button>
      <p class="start-hint" aria-hidden="true">3 · 2 · 1</p>`;
  }
  if (sb.dataset.html !== startHTML) {
    sb.innerHTML = startHTML;
    sb.dataset.html = startHTML;
    const go = $('#go');
    if (go) go.addEventListener('click', startRace);
    const solo = $('#go-solo');
    if (solo) solo.addEventListener('click', () => { primeKeyboard(); startSoloInRoom(); });
  }
}

function startSoloInRoom() {
  if (!R || !R.state) return;
  if (R.race) { R.race.destroy(); R.race = null; }
  if (R.state.race) R.dismissed = R.state.race.id;
  R.view = 'solo';
  R.solo = runSolo({ lang: R.state.room.lang, inRoom: R.code });
}

async function startRace(e) {
  primeKeyboard();
  const btn = e && e.currentTarget;
  if (btn) btn.disabled = true;
  try {
    apply(await rpc('tr_start', { p_code: R.code, p_token: token() }));
  } catch (ex) {
    if (btn) btn.disabled = false;
    if (ex.message === 'need_two') { toast('Everyone else left. Practise solo for now.'); startSoloInRoom(); return; }
    toast(errText(ex));
    refresh();
  }
}

// ---------------------------------------------------------------- online race
function raceLanes(s) {
  const race = s.race;
  return [...race.entries].sort((a, b) => (a.player_id === s.me ? -1 : b.player_id === s.me ? 1 : a.car - b.car)).map((e) => {
    const live = R.progress.get(e.player_id);
    const p = e.place != null ? 1 : live && live.r === race.id ? live.c / (live.n || 1) : 0;
    return {
      id: e.player_id, name: e.player_id === s.me ? 'You' : e.name, car: e.car, avatar: e.avatar,
      me: e.player_id === s.me, p, note: e.place != null ? `${ordinal(e.place)} · ${round(e.wpm)} WPM` : '',
    };
  });
}

function renderRace(s) {
  const race = s.race;
  R.raceId = race.id;
  R.local = null;
  R.finishErr = null;
  R.dismissed = null;
  const startPerf = performance.now() + (Date.parse(race.starts_at) - serverNow());
  R.race = raceScreen({
    snippet: race.snippet,
    lanes: raceLanes(s),
    meId: s.me,
    startPerf,
    onProgress: (p) => R && R.chan.send({ id: R.state.me, r: race.id, ...p }),
    onFinish: (res) => finishRace(race.id, res),
  });
}

function updateRace(s) {
  if (!R.race) return;
  for (const e of s.race.entries) {
    if (e.place != null) R.race.setLane(e.player_id, 1, `${ordinal(e.place)} · ${round(e.wpm)} WPM`);
  }
}

async function finishRace(raceId, res) {
  if (!R) return;
  const r = R;
  r.localDone = raceId;
  r.local = { wpm: res.wpm, accuracy: res.accuracy, ms: res.ms };
  if (r.race) { r.race.destroy(); r.race = null; }
  apply(r.state);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const s = await rpc('tr_finish', {
        p_code: r.code, p_token: token(), p_race: raceId, p_ms: res.ms, p_accuracy: Math.round(res.accuracy * 10) / 10,
      });
      if (r === R) apply(s);
      return;
    } catch (e) {
      if (e.message !== 'offline' || attempt === 3) {
        r.finishErr = e.message;
        if (r === R) apply(r.state);
        return;
      }
      await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
    }
  }
}

// ---------------------------------------------------------------- results
function podHTML(e, place, s) {
  if (!e) return `<div class="pod p${place} empty" aria-hidden="true"></div>`;
  return `
  <div class="pod p${place}" data-avatar="${e.avatar}">
    ${place === 1 ? crownSVG() : ''}
    <span class="fr av">${avatarSVG(e.avatar)}</span>
    <div class="fr block">
      <span class="fr num">${place}</span>
      <div class="fr panel"><div class="nm">${e.player_id === s.me ? 'You' : esc(e.name)}</div><div class="w">${round(e.wpm)}</div></div>
    </div>
  </div>`;
}

function renderResults(s) {
  const race = s.race;
  const mine = myEntry(s);
  const n = race.entries.length;
  const finished = race.entries.filter((e) => e.place != null);
  const waiting = race.entries.filter((e) => e.place == null);
  const placed = mine && mine.place != null;
  const local = R.localDone === race.id ? R.local : null;
  const wpm = placed ? mine.wpm : local ? local.wpm : 0;
  const acc = placed ? mine.accuracy : local ? local.accuracy : 0;
  let ribbon;
  let ribbonCls = '';
  if (placed) ribbon = `${ordinal(mine.place)} of ${n}`;
  else if (R.finishErr && R.localDone === race.id) { ribbon = 'Not counted'; ribbonCls = 'red'; }
  else if (local) ribbon = 'Saving…';
  else { ribbon = 'Didn’t finish'; ribbonCls = 'red'; }
  const first = placed && mine.place === 1;
  const byPlace = (p) => finished.find((e) => e.place === p);
  const showPodium = finished.length > 0;
  const rest = [
    ...finished.filter((e) => e.place > 3).map((e) => `<li><b>${ordinal(e.place)} · ${e.player_id === s.me ? 'You' : esc(e.name)}</b><span>${round(e.wpm)} WPM</span></li>`),
    ...waiting.map((e) => `<li><b>${e.player_id === s.me ? 'You' : esc(e.name)}</b><span>${race.over ? 'didn’t finish' : 'still typing…'}</span></li>`),
  ].join('');
  const left = race.entries.filter((e) => e.place == null && e.player_id !== s.me).length;

  view.innerHTML = `
  <section class="screen screen-results">
    ${header({ back: '#lobby', backLabel: 'Back to the room' })}
    <section class="fr result-card">
      <div class="trophy-wrap">${first ? `${trophySVG()}${sparkSVG('a')}${sparkSVG('b')}${sparkSVG('c')}${sparkSVG('d')}` : carSVG(mine ? mine.car : 0)}</div>
      <div class="big-wpm">${numSVG(round(wpm))}</div>
      <div class="big-unit">WPM</div>
      <div class="ribbon-row">${flagSVG()}<span class="ribbon ${ribbonCls}">${ribbon}</span>${flagSVG()}</div>
      <div class="rule"></div>
      <div class="acc-row">${sightSVG()}<div><b>${numSVG(`${round(acc)}%`)}</b><small>accuracy</small></div></div>
      <p class="result-sub">${esc(langLabel(race.snippet.lang))} · ${esc(race.snippet.title)} · ${esc(s.room.name)}</p>
      ${R.finishErr && R.localDone === race.id ? `<p class="notice red fr result-error">${esc(errText({ message: R.finishErr }))}</p>` : ''}
    </section>
    ${showPodium ? `<div class="podium">${podHTML(byPlace(2), 2, s)}${podHTML(byPlace(1), 1, s)}${podHTML(byPlace(3), 3, s)}</div>` : ''}
    <div class="actions">
      <button class="btn btn-yellow" id="rematch" ${race.over ? '' : 'disabled'}>${iconSVG('rematch')}${race.over ? 'Rematch' : `Waiting for ${left || 1}…`}</button>
      <button class="btn btn-outline" id="share" ${placed ? '' : 'disabled'}>${iconSVG('share')}Share</button>
    </div>
    ${rest ? `<ul class="rest">${rest}</ul>` : ''}
  </section>`;

  $('.mast .back').addEventListener('click', (e) => { e.preventDefault(); R.dismissed = race.id; R.view = null; apply(R.state); });
  $('#rematch').addEventListener('click', startRace);
  $('#share').addEventListener('click', () => shareResult({
    wpm, accuracy: acc, place: placed ? mine.place : null, of: n, lang: race.snippet.lang, title: race.snippet.title,
    room: s.room.name, name: mine ? mine.name : '', avatar: mine ? mine.avatar : 0, car: mine ? mine.car : 0,
    podium: [1, 2, 3].map((p) => byPlace(p)).filter(Boolean).map((e) => ({ name: e.player_id === s.me ? 'You' : e.name, wpm: e.wpm, avatar: e.avatar, place: e.place })),
  }).catch(() => toast('Couldn’t make the image')));
}

// ---------------------------------------------------------------- router
let soloCtl = null;
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (soloCtl) { soloCtl.destroy(); soloCtl = null; }
  if (a === 'r' && b && /^[A-Za-z0-9]{5}$/.test(b)) {
    const code = b.toUpperCase();
    if (R && R.code === code) return;
    openRoom(code);
    return;
  }
  teardown();
  if (a === 'solo') {
    const lang = LANG_IDS.includes(b) ? b : store.get('lang', 'python');
    soloCtl = runSolo({ lang });
    return;
  }
  showHome();
}

addEventListener('hashchange', route);
addEventListener('pageshow', (e) => { if (e.persisted && R) refresh(); });
route();
void SNIPPETS;
