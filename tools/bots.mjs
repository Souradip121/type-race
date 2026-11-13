// Test racers. Joins a room as one or more bots that heartbeat, drive their car
// over Realtime at a fixed WPM when a race starts, and finish through the real
// tr_finish RPC (so the server's timing and 250 WPM check apply to them too).
//
//   node tools/bots.mjs <ROOM-CODE> "Riya:1:62" "Arjun:2:51" ["Name:avatar:wpm" ...] [--races N] [--start]
//
// --races N   leave after N races (default: run until Ctrl+C)
// --start     the first bot presses Start (Rematch) once the previous race is over
// Bots are ordinary players: they count toward the 6-racer limit and leave on exit.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfgSrc = readFileSync(join(root, 'config.js'), 'utf8');
const URL_ = /supabaseUrl:\s*"([^"]+)"/.exec(cfgSrc)[1];
const KEY = /supabaseAnonKey:\s*"([^"]+)"/.exec(cfgSrc)[1];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const args = process.argv.slice(2);
const code = (args.shift() || '').toUpperCase();
const flags = { races: Infinity, start: false };
const specs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--races') flags.races = Number(args[++i]);
  else if (args[i] === '--start') flags.start = true;
  else specs.push(args[i]);
}
if (!/^[A-Z2-9]{5}$/.test(code) || !specs.length) {
  console.log('usage: node tools/bots.mjs CODE "Name:avatar:wpm" ...');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(fn, a) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(a) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${body && body.message}`);
  return body;
}

// one shared Realtime socket for broadcasting progress and hearing 'sync'
const topic = `realtime:typerace:${code}`;
let ref = 0;
const ws = new WebSocket(`${URL_.replace('https', 'wss')}/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0`);
const listeners = new Set();
await new Promise((resolve, reject) => {
  ws.addEventListener('open', () => ws.send(JSON.stringify({ topic, event: 'phx_join', ref: String(++ref),
    payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false }, access_token: KEY } })));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.event === 'phx_reply' && m.ref === '1') resolve();
    if (m.event === 'broadcast' && m.payload && m.payload.event === 'sync') listeners.forEach((f) => f());
  });
  ws.addEventListener('error', reject);
});
setInterval(() => ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })), 20000);
const broadcast = (payload) => ws.send(JSON.stringify({ topic, event: 'broadcast', ref: String(++ref),
  payload: { type: 'broadcast', event: 'p', payload } }));

class Bot {
  constructor(spec, lead) {
    const [name, avatar, wpm] = spec.split(':');
    Object.assign(this, { name, avatar: Number(avatar) || 0, wpm: Number(wpm) || 45, lead });
    this.token = randomBytes(24).toString('base64url');
    this.racing = null;
    this.raced = 0;
    this.me = null;
  }
  async start() {
    const s = await rpc('tr_join', { p_code: code, p_token: this.token, p_name: this.name, p_avatar: this.avatar });
    this.me = s.me;
    console.log(`${this.name} joined (car ${s.players.find((p) => p.id === s.me).car})`);
    listeners.add(() => this.tick());
    this.loop = setInterval(() => this.tick(), 3000);
    this.tick();
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const s = await rpc('tr_state', { p_code: code, p_token: this.token });
      const race = s.race;
      const mine = race && race.entries.find((e) => e.player_id === this.me);
      if (race && mine && mine.place == null && !race.over && this.racing !== race.id) this.drive(s);
      if (this.lead && flags.start && race && race.over && this.raced < flags.races && this.lastStarted !== race.id) {
        this.lastStarted = race.id;
        await sleep(2500);
        await rpc('tr_start', { p_code: code, p_token: this.token }).catch(() => {});
      }
    } catch (e) {
      console.log(this.name, e.message);
    } finally {
      this.busy = false;
    }
  }
  async drive(s) {
    const race = s.race;
    this.racing = race.id;
    const total = race.snippet.typed_len;
    const offset = Date.parse(s.now) - Date.now();
    const startAt = Date.parse(race.starts_at) - offset;
    const jitter = 0.9 + Math.random() * 0.2;
    const cps = (this.wpm * jitter * 5) / 60000;
    console.log(`${this.name} racing "${race.snippet.title}" (${total} chars) at ~${Math.round(this.wpm * jitter)} WPM`);
    await sleep(Math.max(0, startAt - Date.now()));
    let c = 0;
    while (c < total) {
      await sleep(220);
      c = Math.min(total, Math.floor((Date.now() - startAt) * cps));
      broadcast({ id: this.me, r: race.id, c, n: total, w: this.wpm });
    }
    const ms = Date.now() - startAt;
    try {
      const st = await rpc('tr_finish', { p_code: code, p_token: this.token, p_race: race.id, p_ms: ms, p_accuracy: 90 + Math.random() * 9 });
      const e = st.race.entries.find((x) => x.player_id === this.me);
      console.log(`${this.name} finished ${e.place} at ${e.wpm} WPM`);
    } catch (e) {
      console.log(this.name, 'finish refused:', e.message);
    }
    this.raced++;
    if (this.raced >= flags.races) setTimeout(() => this.stop(), 8000);
  }
  async stop() {
    clearInterval(this.loop);
    await rpc('tr_leave', { p_code: code, p_token: this.token }).catch(() => {});
    this.stopped = true;
    if (bots.every((b) => b.stopped)) process.exit(0);
  }
}

const bots = specs.map((s, i) => new Bot(s, i === 0));
for (const b of bots) await b.start();
const bye = async () => { await Promise.all(bots.map((b) => b.stop())); process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
