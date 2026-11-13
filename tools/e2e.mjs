// Two-browser race through the real UI, against the Supabase project in config.js.
// Two isolated Chrome contexts (separate localStorage = separate players):
// A makes a room, B joins from the link, A starts, both type the snippet with
// real key events (B a little slower, A with one typo fixed by Backspace),
// then both results screens must show the same placings and WPM. Then a
// rematch from B must pull both into a new race.
//
//   node tools/e2e.mjs [baseUrl] [--shots dir]
//   default baseUrl http://127.0.0.1:8799/
// Test rooms are named "e2e <tag>"; delete them with
//   delete from public.tr_rooms where name like 'e2e %';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8799/';
const shotsIdx = args.indexOf('--shots');
const SHOTS = shotsIdx >= 0 ? args[shotsIdx + 1] : null;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const tag = randomBytes(2).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; let fail = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : info}`); };

// ------------------------------------------------------------ tiny CDP client
const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'typerace-e2e-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
let version;
for (let i = 0; i < 60 && !version; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});

async function newPage(label) {
  const { browserContextId } = await cdp('Target.createBrowserContext');
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: false });
  const page = {
    label,
    async go(url) { await s('Page.navigate', { url }); await sleep(1200); },
    async eval(expr) {
      const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${label}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    },
    async waitFor(expr, ms = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await page.eval(expr)) return true; await sleep(150); }
      throw new Error(`${label}: timed out waiting for ${expr}`);
    },
    async key(k) {
      const map = { Enter: { code: 'Enter', vk: 13, text: '\r' }, Backspace: { code: 'Backspace', vk: 8, text: '' } }[k];
      await s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: map.code, windowsVirtualKeyCode: map.vk, text: map.text || undefined });
      await s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: map.code, windowsVirtualKeyCode: map.vk });
    },
    async type(ch) {
      if (ch === '\n') return page.key('Enter');
      await s('Input.insertText', { text: ch });
    },
    async shot(file) {
      if (!SHOTS) return;
      mkdirSync(SHOTS, { recursive: true });
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(SHOTS, file), Buffer.from(data, 'base64'));
    },
  };
  return page;
}

// What the player must type: each line's text without indentation, joined by Enter.
const SNIPPET_JS = `[...document.querySelectorAll('.code .ln .tx')].map(t => [...t.childNodes].filter(n => !n.classList || !n.classList.contains('eol')).map(n => n.textContent).join('')).join('\\n')`;

async function race(page, cps, { typoAt = -1 } = {}) {
  await page.waitFor(`document.querySelector('.countdown') && document.querySelector('.countdown').hidden === false && document.querySelector('.countdown b').textContent === 'GO!' || (document.querySelector('.countdown') && document.querySelector('.countdown').hidden)`, 12000);
  await page.eval(`document.querySelector('.typer').focus()`);
  const text = await page.eval(SNIPPET_JS);
  for (let i = 0; i < text.length; i++) {
    if (i === typoAt) { await page.type('#'); await sleep(250); await page.key('Backspace'); }
    await page.type(text[i]);
    await sleep(1000 / cps);
  }
  return text;
}

try {
  console.log(`Type Race e2e on ${BASE} (room "e2e ${tag}")`);
  const A = await newPage('A');
  const B = await newPage('B');

  // A makes a room
  await A.go(BASE);
  await A.eval(`(() => { const n = document.querySelector('#f-name'); n.value = 'Asha'; document.querySelector('#f-room').value = 'e2e ${tag}';
    document.querySelector('.chip[data-lang="java"]').click(); document.querySelector('#make .btn').click(); })()`);
  await A.waitFor(`/#\\/r\\/[A-Z0-9]{5}$/.test(location.hash) && !!document.querySelector('.screen-lobby')`);
  const code = await A.eval(`location.hash.slice(4)`);
  check('A made a room and sees the lobby', /^[A-Z2-9]{5}$/.test(code), code);
  check('lobby shows Practise solo while alone', await A.eval(`!!document.querySelector('#go-solo')`));
  await A.shot('e2e-lobby-alone.png');

  // B joins from the link
  await B.go(`${BASE}#/r/${code}`);
  await B.waitFor(`!!document.querySelector('#j-name')`);
  await B.eval(`document.querySelector('#j-name').value = 'Bilal'; document.querySelector('#jform .btn').click()`);
  await B.waitFor(`document.querySelectorAll('#racers .racer:not(.waiting)').length === 2`);
  await A.waitFor(`document.querySelectorAll('#racers .racer:not(.waiting)').length === 2 && !!document.querySelector('#go')`, 10000);
  check('both lobbies list two racers', true);
  check('room language is Java on B', await B.eval(`document.querySelector('.chip[aria-checked="true"]').dataset.lang === 'java'`));
  await A.shot('e2e-lobby-two.png');

  // A starts; both count down
  await A.eval(`document.querySelector('#go').click()`);
  await Promise.all([A.waitFor(`!!document.querySelector('.screen-race')`), B.waitFor(`!!document.querySelector('.screen-race')`, 10000)]);
  const titleA = await A.eval(`document.querySelector('.code-title span').textContent`);
  const titleB = await B.eval(`document.querySelector('.code-title span').textContent`);
  check('both race the same snippet', titleA === titleB && /^Java · /.test(titleA), `${titleA} | ${titleB}`);
  check('typing before GO is ignored', await (async () => { await A.eval(`document.querySelector('.typer').focus()`); await A.type('x'); return A.eval(`document.querySelector('.ln.cur .bad') === null`); })());

  // race: A faster with a typo, B slower
  const sample = (async () => {
    await sleep(6500);
    const p = await A.eval(`Number(getComputedStyle(document.querySelectorAll('.lane')[1]).getPropertyValue('--p'))`);
    await A.shot('e2e-race-A.png');
    await B.shot('e2e-race-B.png');
    return p;
  })();
  const [textA] = await Promise.all([race(A, 11, { typoAt: 12 }), race(B, 7)]);
  const seenB = await sample;
  check('A sees B\'s car move over Realtime during the race', seenB > 0.02, `--p ${seenB}`);

  await Promise.all([A.waitFor(`!!document.querySelector('.screen-results')`), B.waitFor(`!!document.querySelector('.screen-results')`, 20000)]);
  await Promise.all([
    A.waitFor(`document.querySelector('#rematch') && !document.querySelector('#rematch').disabled`, 15000),
    B.waitFor(`document.querySelector('#rematch') && !document.querySelector('#rematch').disabled`, 15000),
  ]);
  const read = (p) => p.eval(`({ ribbon: document.querySelector('.ribbon').textContent, big: document.querySelector('.big-wpm').textContent,
    acc: document.querySelector('.acc-row b').textContent,
    podium: [...document.querySelectorAll('.pod:not(.empty)')].map(x => x.className.match(/p(\\d)/)[1] + ':' + x.querySelector('.nm').textContent + ':' + x.querySelector('.w').textContent).sort().join(',') })`);
  const ra = await read(A);
  const rb = await read(B);
  console.log('   A sees', JSON.stringify(ra));
  console.log('   B sees', JSON.stringify(rb));
  check('A is 1st of 2', ra.ribbon === '1st of 2', ra.ribbon);
  check('B is 2nd of 2', rb.ribbon === '2nd of 2', rb.ribbon);
  const norm = (pod, me, other) => pod.replace(/:You:/, `:${me}:`).replace(new RegExp(`:${other}:`), `:${other}:`);
  check('both podiums show the same placings and WPM', norm(ra.podium, 'Asha', 'Bilal') === norm(rb.podium, 'Bilal', 'Asha'), `${ra.podium} vs ${rb.podium}`);
  const expectA = Math.round((textA.length / 5) / ((textA.length / 11 + 0.25 + 0.4) / 60));
  check('A\'s WPM is plausible for 11 chars/s', Math.abs(Number(ra.big) - expectA) < 25, `${ra.big} vs ~${expectA}`);
  check('A\'s accuracy is below 100 after the typo', Number(ra.acc.replace('%', '')) < 100, ra.acc);
  check('B\'s accuracy is 100', rb.acc === '100%', rb.acc);
  await A.shot('e2e-results-A.png');
  await B.shot('e2e-results-B.png');

  // rematch from B pulls both into a new race
  await B.eval(`document.querySelector('#rematch').click()`);
  await Promise.all([A.waitFor(`!!document.querySelector('.screen-race')`, 10000), B.waitFor(`!!document.querySelector('.screen-race')`, 10000)]);
  const t2a = await A.eval(`document.querySelector('.code-title span').textContent`);
  const t2b = await B.eval(`document.querySelector('.code-title span').textContent`);
  check('rematch: both are in race 2 on the same new snippet', t2a === t2b && t2a !== titleA, `${t2a} | ${t2b}`);

  // leaving: B goes home, A's lobby drops to one racer once race 2 is over
  await B.go('about:blank');
  await A.eval(`location.hash = '#/'`);
  await sleep(800);
  check('A back on the home screen', await A.eval(`!!document.querySelector('.screen-home')`));
} catch (e) {
  fail++;
  console.log('  FAIL', e.message);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`Clean up: delete from public.tr_rooms where name like 'e2e ${tag}';`);
  try { await cdp('Browser.close'); } catch { /* closed */ }
  chrome.kill();
  process.exit(fail ? 1 : 0);
}
