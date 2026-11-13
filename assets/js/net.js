// Supabase: RPC calls, a server clock estimate, and the room's Realtime channel.
const cfg = window.TYPERACE || {};
let client = null;

export const configured = () => Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);

function sb() {
  if (!client) {
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'typerace-auth' },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

// --- server clock -------------------------------------------------------------
// Each reply carries the server's `now`. Keep the sample with the shortest
// round trip from the last minute: serverNow() = that sample + time since.
let best = null;
function sample(nowIso, t0, t1) {
  const rtt = t1 - t0;
  const s = { server: Date.parse(nowIso), perf: (t0 + t1) / 2, rtt, at: t1 };
  if (!best || rtt <= best.rtt || t1 - best.at > 60000) best = s;
}
export function serverNow() {
  return best ? best.server + (performance.now() - best.perf) : Date.now();
}

// --- RPC ------------------------------------------------------------------------
export class RaceError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export async function rpc(fn, args) {
  if (!configured()) throw new RaceError('not_configured', 0, '');
  const t0 = performance.now();
  let res;
  try {
    res = await sb().rpc(fn, args);
  } catch {
    throw new RaceError('offline', 0, '');
  }
  const t1 = performance.now();
  if (res.error) {
    const e = res.error;
    const status = Number(String(e.code || '').replace(/^PT/, '')) || res.status || 0;
    throw new RaceError(e.message || 'error', status, e.code);
  }
  if (res.data && res.data.now) sample(res.data.now, t0, t1);
  return res.data;
}

// Leaving: fire-and-forget that survives the page closing.
export function leaveBeacon(code, token) {
  if (!configured()) return;
  try {
    fetch(`${cfg.supabaseUrl}/rest/v1/rpc/tr_leave`, {
      method: 'POST', keepalive: true,
      headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code, p_token: token }),
    }).catch(() => {});
  } catch { /* closing */ }
}

// --- Realtime -------------------------------------------------------------------
// 'sync' comes from the database (someone joined, started, finished...): refetch.
// 'p' is a racer's live progress, sent by their browser; it only moves cars.
export function joinChannel(code, { onSync, onProgress, onStatus }) {
  if (!configured()) return { send() {}, close() {} };
  const ch = sb().channel(`typerace:${code}`, { config: { broadcast: { self: false, ack: false } } });
  ch.on('broadcast', { event: 'sync' }, (m) => onSync && onSync(m.payload || {}))
    .on('broadcast', { event: 'p' }, (m) => onProgress && onProgress(m.payload || {}))
    .subscribe((status) => onStatus && onStatus(status));
  return {
    send(payload) {
      if (ch.state === 'joined') ch.send({ type: 'broadcast', event: 'p', payload });
    },
    close() { sb().removeChannel(ch); },
  };
}
