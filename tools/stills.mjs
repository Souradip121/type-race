// Reel stills (1170x2532 = 390x844 @3x) of a real 4-racer race: you in headless
// Chrome plus three bots (tools/bots.mjs) in one room on the live backend.
//
//   node tools/stills.mjs [baseUrl] [outDir]
//   default baseUrl http://127.0.0.1:8799/   outDir screenshots/
// The bots' names are made up for the demo. The room is named "CSE-B" and is
// left to expire (24 h); delete it sooner with
//   delete from public.tr_rooms where code = '<code printed below>';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://127.0.0.1:8799/';
const OUT = process.argv[3] || join(here, '..', 'screenshots');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tr-stills-'))}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((ok, no) => { const n = ++id; pending.set(n, (m) => (m.error ? no(new Error(`${method}: ${m.error.message}`)) : ok(m.result))); ws.send(JSON.stringify({ id: n, method, params })); });
const run = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await run(expr)) return; await sleep(150); } throw new Error(`timeout: ${expr}`); };
const shot = async (file) => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, file), Buffer.from(data, 'base64')); console.log('saved', file); };
const typeChar = async (ch) => {
  if (ch === '\n') {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  } else if (ch === '\b') {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  } else await cdp('Input.insertText', { text: ch });
};

let bots;
try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('typerace.avatar', '0'); localStorage.setItem('typerace.name', '"Souradip"'); localStorage.setItem('typerace.lang', '"python"'); } catch {}` });
  await cdp('Page.navigate', { url: BASE });
  await waitFor(`!!document.querySelector('#make')`);
  await sleep(600);
  await shot('home.png');
  await run(`document.querySelector('#f-room').value = 'CSE-B'; document.querySelector('#make .btn').click()`);
  await waitFor(`!!document.querySelector('.screen-lobby')`);
  const code = await run(`location.hash.slice(4)`);
  console.log('room', code);

  bots = spawn(process.execPath, [join(here, 'bots.mjs'), code, 'Riya:1:58', 'Arjun:2:49', 'Soham:3:38', '--races', '6'], { stdio: 'inherit' });
  await waitFor(`document.querySelectorAll('#racers .racer:not(.waiting)').length === 4`, 30000);
  await sleep(1500);
  await run(`window.scrollTo(0, 0)`);
  await shot('lobby.png');

  // Race until a 6-8 line snippet comes up (short ones leave the reel frame empty).
  for (let round = 1; round <= 5; round++) {
    await run(round === 1 ? `document.querySelector('#go').click()` : `document.querySelector('#rematch').click()`);
    await waitFor(`!!document.querySelector('.screen-race')`);
    const lines = await run(`document.querySelectorAll('.code .ln').length`);
    const keep = lines >= 6 || round === 5;
    console.log(`race ${round}: ${lines} lines${keep ? '' : ' (too short, rematch)'}`);
    await waitFor(`document.querySelector('.countdown').hidden`, 12000);
    await run(`document.querySelector('.typer').focus()`);
    const text = await run(`[...document.querySelectorAll('.code .ln .tx')].map(t => [...t.childNodes].filter(n => !n.classList || !n.classList.contains('eol')).map(n => n.textContent).join('')).join('\\n')`);
    const cps = keep ? 6.9 : 12; // about 83 WPM for the race that is kept
    const typoAt = Math.floor(text.length * 0.42);
    for (let i = 0; i < text.length; i++) {
      if (keep && i === typoAt) {
        await typeChar(text[i] === 'x' ? 'z' : 'x');
        await sleep(260);
        await shot('race.png');
        await typeChar('\b');
      }
      await typeChar(text[i]);
      await sleep(1000 / cps);
    }
    await waitFor(`!!document.querySelector('.screen-results')`);
    await waitFor(`document.querySelector('#rematch') && !document.querySelector('#rematch').disabled`, 60000);
    if (keep) break;
    await sleep(1500);
  }
  await sleep(800);
  await run(`window.scrollTo(0, 0)`);
  await shot('results.png');
  // the share card the Share button makes
  const card = await run(`(async () => {
    const m = await import('./assets/js/share.js');
    const ribbon = document.querySelector('.ribbon').textContent;
    const [place, of] = (ribbon.match(/(\\d+)\\D+of (\\d+)/) || []).slice(1).map(Number);
    const pods = [...document.querySelectorAll('.pod:not(.empty)')].map((p) => ({
      place: Number(p.className.match(/p(\\d)/)[1]), name: p.querySelector('.nm').textContent, wpm: Number(p.querySelector('.w').textContent), avatar: Number(p.dataset.avatar) }));
    const meta = document.querySelector('.result-sub').textContent.split(' · ');
    const cv = await m.drawCard({ wpm: Number(document.querySelector('.big-wpm svg').getAttribute('aria-label')), accuracy: parseFloat(document.querySelector('.acc-row b').textContent),
      place, of, lang: meta[0].toLowerCase(), title: meta[1], room: meta[2], podium: pods, car: 0 });
    return cv.toDataURL('image/png');
  })()`);
  writeFileSync(join(OUT, 'share-card.png'), Buffer.from(card.split(',')[1], 'base64'));
  console.log('saved share-card.png');
  console.log(`\nRoom ${code} (delete: delete from public.tr_rooms where code = '${code}';)`);
} catch (e) {
  console.error('FAILED', e.message);
  process.exitCode = 1;
} finally {
  await sleep(500);
  try { bots && bots.kill('SIGTERM'); } catch { /* gone */ }
  try { await cdp('Browser.close'); } catch { /* closed */ }
  chrome.kill();
  setTimeout(() => process.exit(), 1500);
}
