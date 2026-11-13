// Live checks against the Supabase project in config.js: table lock-down,
// every RPC's happy path and refusals, server timing and the 250 WPM cap,
// placings, room limits, and the database's Realtime broadcast.
//
//   node scripts/live-check.mjs
//
// Test rooms are named "lc <random>". Anonymous callers cannot delete rooms,
// so remove them afterwards in the SQL editor (or wait 24 hours):
//   delete from public.tr_rooms where name like 'lc %';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfgSrc = readFileSync(join(root, 'config.js'), 'utf8');
const URL_ = /supabaseUrl:\s*"([^"]+)"/.exec(cfgSrc)[1];
const KEY = /supabaseAnonKey:\s*"([^"]+)"/.exec(cfgSrc)[1];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = () => randomBytes(24).toString('base64url');
const tag = randomBytes(3).toString('hex');

let pass = 0, fail = 0;
function check(name, ok, info = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${info}`); }
}

async function rpc(fn, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const msg = (r) => (r.body && (r.body.message || r.body.code)) || '';

// Minimal Realtime client: join a public broadcast topic, collect 'sync' events.
function listen(topic) {
  const events = [];
  const ws = new WebSocket(`${URL_.replace('https', 'wss')}/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0`);
  let ref = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ topic: `realtime:${topic}`, event: 'phx_join', ref: String(++ref),
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false }, access_token: KEY } }));
    });
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.event === 'phx_reply' && m.ref === '1') m.payload.status === 'ok' ? resolve() : reject(new Error(JSON.stringify(m.payload)));
      if (m.event === 'broadcast') events.push(m.payload);
    });
    ws.addEventListener('error', () => reject(new Error('websocket error')));
  });
  const beat = setInterval(() => ws.readyState === 1 &&
    ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })), 20000);
  return { events, ready, close: () => { clearInterval(beat); ws.close(); } };
}

console.log(`Type Race live check (${URL_}), rooms "lc ${tag}*"`);

// --- 1. Tables are locked --------------------------------------------------
console.log('Tables');
for (const t of ['tr_snippets', 'tr_rooms', 'tr_players', 'tr_races', 'tr_entries']) {
  const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: H });
  check(`anon cannot read ${t}`, r.status === 401 || r.status === 403 || r.status === 404, `got ${r.status}`);
}
{
  const r = await fetch(`${URL_}/rest/v1/tr_rooms`, { method: 'POST', headers: H,
    body: JSON.stringify({ code: 'ZZZZZ', name: 'hack' }) });
  check('anon cannot insert into tr_rooms', r.status >= 400, `got ${r.status}`);
}
for (const fn of ['tr__state', 'tr__hash', 'tr__assign_car', 'tr__notify', 'tr__room']) {
  const r = await rpc(fn, {});
  check(`internal ${fn} is not callable`, r.status === 401 || r.status === 403 || r.status === 404, `got ${r.status}`);
}

// --- 2. Rooms and joining --------------------------------------------------
console.log('Rooms');
const A = token(), B = token(), C = token();
let r = await rpc('tr_create_room', { p_token: 'short', p_room_name: `lc ${tag}`, p_player_name: 'A', p_lang: 'python', p_avatar: 0 });
check('bad token is refused', r.status === 400, `${r.status} ${msg(r)}`);
r = await rpc('tr_create_room', { p_token: A, p_room_name: `lc ${tag}`, p_player_name: 'x'.repeat(15), p_lang: 'python', p_avatar: 0 });
check('15-character name is refused', r.status === 400 && /name_too_long/.test(msg(r)), `${r.status} ${msg(r)}`);
r = await rpc('tr_create_room', { p_token: A, p_room_name: `lc ${tag}`, p_player_name: 'A', p_lang: 'rust', p_avatar: 0 });
check('unknown language is refused', r.status === 400, `${r.status} ${msg(r)}`);

r = await rpc('tr_create_room', { p_token: A, p_room_name: `lc ${tag}`, p_player_name: 'Alpha', p_lang: 'python', p_avatar: 2 });
check('create room', r.status === 200 && /^[A-Z2-9]{5}$/.test(r.body?.room?.code), `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const code = r.body.room.code;
const meA = r.body.me;
check('creator is in the room with car 0', r.body.players.length === 1 && r.body.players[0].car === 0 && r.body.players[0].id === meA);
check('the player token is not echoed back', !JSON.stringify(r.body).includes(A));

const rt = listen(`typerace:${code}`);
await rt.ready;

r = await rpc('tr_join', { p_code: code.toLowerCase(), p_token: B, p_name: 'Bravo', p_avatar: 5 });
check('join (code is case-insensitive)', r.status === 200 && r.body.players.length === 2, `${r.status} ${msg(r)}`);
const meB = r.body.me;
check('second racer gets a different car', new Set(r.body.players.map((p) => p.car)).size === 2);
r = await rpc('tr_join', { p_code: code, p_token: B, p_name: 'Bravo2', p_avatar: 6 });
check('re-join updates name, no duplicate', r.status === 200 && r.body.players.length === 2 && r.body.players.some((p) => p.name === 'Bravo2' && p.avatar === 6));
r = await rpc('tr_join', { p_code: 'QQQQQ', p_token: B, p_name: 'B', p_avatar: 0 });
check('unknown room is 404', r.status === 404, `${r.status}`);

r = await rpc('tr_state', { p_code: code, p_token: C });
check('a visitor can see the room but is not in it', r.status === 200 && r.body.me === null && r.body.players.length === 2);
r = await rpc('tr_set_lang', { p_code: code, p_token: C, p_lang: 'c' });
check('a visitor cannot change the language', r.status === 403, `${r.status}`);
r = await rpc('tr_start', { p_code: code, p_token: C });
check('a visitor cannot start a race', r.status === 403, `${r.status}`);
r = await rpc('tr_set_lang', { p_code: code, p_token: A, p_lang: 'c' });
check('a racer can change the language', r.status === 200 && r.body.room.lang === 'c');

// --- 3. A race -------------------------------------------------------------
console.log('Race');
r = await rpc('tr_start', { p_code: code, p_token: A });
check('start a race with two racers', r.status === 200 && r.body.race && r.body.race.entries.length === 2, `${r.status} ${msg(r)}`);
const race = r.body.race;
const lead = new Date(race.starts_at) - new Date(r.body.now);
check('countdown of about 4.5 s', lead > 4000 && lead <= 4600, `${lead} ms`);
check('snippet is in the room language', race.snippet.lang === 'c' && race.snippet.typed_len > 20);
r = await rpc('tr_start', { p_code: code, p_token: B });
check('pressing Start again joins the same race', r.status === 200 && r.body.race.id === race.id);
r = await rpc('tr_set_lang', { p_code: code, p_token: A, p_lang: 'java' });
check('language is locked during a race', r.status === 409, `${r.status}`);
r = await rpc('tr_join', { p_code: code, p_token: C, p_name: 'Charlie', p_avatar: 1 });
check('a late joiner waits for the next race', r.status === 200 && r.body.race.entries.length === 2);
r = await rpc('tr_finish', { p_code: code, p_token: A, p_race: race.id, p_ms: 1000, p_accuracy: 100 });
check('finishing before the start is refused', r.status === 422 && /impossible_score/.test(msg(r)), `${r.status} ${msg(r)}`);

await sleep(Math.max(0, lead) + 300);
r = await rpc('tr_finish', { p_code: code, p_token: A, p_race: race.id, p_ms: 300, p_accuracy: 100 });
check('a finish 0.3 s after GO (over 250 WPM) is refused', r.status === 422 && /impossible_score/.test(msg(r)), `${r.status} ${msg(r)}`);
r = await rpc('tr_state', { p_code: code, p_token: A });
check('the refused score was not recorded', r.body.race.entries.every((e) => e.ms === null));

const minMs = race.snippet.typed_len * 48; // 250 WPM = typed_len * 48 ms
await sleep(minMs + 1500);
r = await rpc('tr_finish', { p_code: code, p_token: A, p_race: race.id, p_ms: 500, p_accuracy: 150 });
check('accuracy above 100 is refused', r.status === 400, `${r.status}`);
r = await rpc('tr_finish', { p_code: code, p_token: A, p_race: race.id, p_ms: 500, p_accuracy: 97.25 });
const eA = r.body.race?.entries.find((e) => e.player_id === meA);
check('finish: recorded with place 1', r.status === 200 && eA?.place === 1, `${r.status} ${msg(r)}`);
check('a claimed time far below the server clock is not believed', eA && eA.ms >= minMs, `ms ${eA?.ms}`);
check('server WPM is chars/5 per minute', eA && Math.abs(eA.wpm - (race.snippet.typed_len / 5) / (eA.ms / 60000)) < 0.06, `wpm ${eA?.wpm}`);
check('race not over while Bravo is still typing', r.body.race.over === false);
r = await rpc('tr_finish', { p_code: code, p_token: C, p_race: race.id, p_ms: 9000, p_accuracy: 90 });
check('someone who was not in the race cannot finish it', r.status === 403, `${r.status}`);

await sleep(1200);
const before = Date.now();
r = await rpc('tr_finish', { p_code: code, p_token: B, p_race: race.id, p_ms: null, p_accuracy: 88 });
const eB = r.body.race?.entries.find((e) => e.player_id === meB);
check('second finisher gets place 2', r.status === 200 && eB?.place === 2, `${r.status} ${msg(r)}`);
check('race is over once everyone finished', r.body.race.over === true);
const sA = (await rpc('tr_state', { p_code: code, p_token: A })).body;
const sB = (await rpc('tr_state', { p_code: code, p_token: B })).body;
const placings = (s) => s.race.entries.map((e) => `${e.player_id}:${e.place}:${e.wpm}`).join(',');
check('both racers see the same placings', placings(sA) === placings(sB), `${placings(sA)} vs ${placings(sB)}`);
r = await rpc('tr_finish', { p_code: code, p_token: B, p_race: race.id, p_ms: 100, p_accuracy: 100 });
check('finishing twice changes nothing', r.status === 200 && r.body.race.entries.find((e) => e.player_id === meB).wpm === eB.wpm);
void before;

r = await rpc('tr_start', { p_code: code, p_token: B });
check('rematch starts race 2 with everyone present', r.status === 200 && r.body.race.seq === 2 && r.body.race.entries.length === 3, `${r.status} ${msg(r)}`);
check('rematch uses a different snippet', r.body.race.snippet.id !== race.snippet.id);

// --- 4. Leaving, solo, full rooms -----------------------------------------
console.log('Room limits');
r = await rpc('tr_leave', { p_code: code, p_token: C });
r = await rpc('tr_state', { p_code: code, p_token: A });
check('a racer who leaves disappears from the room', r.body.players.length === 2 && !r.body.players.some((p) => p.name === 'Charlie'));

const S = token();
r = await rpc('tr_create_room', { p_token: S, p_room_name: `lc ${tag} solo`, p_player_name: 'Solo', p_lang: 'java', p_avatar: 0 });
const solo = r.body.room.code;
r = await rpc('tr_start', { p_code: solo, p_token: S });
check('one racer alone cannot start a server race (solo is local)', r.status === 409 && /need_two/.test(msg(r)), `${r.status} ${msg(r)}`);
const tokens = [S];
for (let i = 1; i <= 5; i++) {
  const t = token(); tokens.push(t);
  r = await rpc('tr_join', { p_code: solo, p_token: t, p_name: `R${i}`, p_avatar: i });
}
check('six racers fit, each with their own car', r.status === 200 && r.body.players.length === 6 && new Set(r.body.players.map((p) => p.car)).size === 6);
r = await rpc('tr_join', { p_code: solo, p_token: token(), p_name: 'Seventh', p_avatar: 0 });
check('a seventh racer is refused (room_full)', r.status === 409 && /room_full/.test(msg(r)), `${r.status} ${msg(r)}`);

// --- 5. Realtime -----------------------------------------------------------
await sleep(1500);
rt.close();
const kinds = rt.events.filter((e) => e.event === 'sync').map((e) => e.payload?.kind);
check('database broadcasts reach a public channel (join/start/finish)',
  ['join', 'start', 'finish'].every((k) => kinds.includes(k)), JSON.stringify(kinds));

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`Clean up: delete from public.tr_rooms where name like 'lc ${tag}%';`);
process.exit(fail ? 1 : 0);
