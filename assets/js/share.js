// The share card: a 1080x1920 PNG (Instagram story size) drawn from the same
// pixel art as the app, then handed to the phone's share sheet.
import { GRIDS, CARS, C } from './sprites.js';
import { LANGS } from './snippets.js';

const W = 1080;
const H = 1920;
const SITE = 'souradip121.github.io/type-race';
const ordinal = (n) => `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n] || 'th'}`;
const langLabel = (id) => (LANGS.find((l) => l.id === id) || {}).label || id;

function grid(ctx, rows, pal, x, y, s) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (!col || row[i] === '.') continue;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + i * s), Math.round(y + j * s), Math.ceil(s), Math.ceil(s));
    }
  });
}

// Stepped-corner box, the same shape as the app's pixel frames (u = one art pixel).
function pxBox(ctx, x, y, w, h, u, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x + 3 * u, y, w - 6 * u, h);
  ctx.fillRect(x + u, y + u, w - 2 * u, h - 2 * u);
  ctx.fillRect(x, y + 3 * u, w, h - 6 * u);
}
function pxFrame(ctx, x, y, w, h, u, stroke, fill) {
  pxBox(ctx, x, y, w, h, u, stroke);
  pxBox(ctx, x + u, y + u, w - 2 * u, h - 2 * u, u, fill);
  // re-cut the inner corners to keep a one-pixel stepped line
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2 * u, y + 2 * u, w - 4 * u, h - 4 * u);
}

function flag(ctx, x, y, s, mirror = false) {
  ctx.save();
  if (mirror) { ctx.translate(x * 2 + 12 * s, 0); ctx.scale(-1, 1); }
  grid(ctx, GRIDS.FLAG, { P: '#C8D3E6', W: '#F3F8FF', N: '#0A1230' }, x, y, s);
  ctx.restore();
}

function avatar(ctx, i, x, y, s) {
  const a = GRIDS.AVATARS[((i % GRIDS.AVATARS.length) + GRIDS.AVATARS.length) % GRIDS.AVATARS.length];
  grid(ctx, a.grid, {
    h: a.h, s: a.s, e: '#0A1230', m: '#9A3B2E', c: a.c, g: a.g || '#0A1230', p: a.p || a.h, b: a.b || a.h, y: a.y || a.h,
  }, x, y, s);
}

function car(ctx, i, x, y, s) {
  const k = CARS[i % CARS.length];
  grid(ctx, GRIDS.CAR_GRID, {
    K: '#0A1230', B: k.B, D: k.D, L: k.L, W: k.W, T: '#0E1222', H: '#C8D3E6', Y: '#FFF6B8', R: '#FF4D4D', S: 'rgba(0,6,24,.45)',
  }, x, y, s);
}

function text(ctx, str, x, y, { size = 40, weight = 700, color = C.white, align = 'center', font = 'Tiny5' } = {}) {
  ctx.font = `${weight} ${size}px "${font}", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function fitText(ctx, str, max, size, weight = 600) {
  let s = size;
  ctx.font = `${weight} ${s}px "Tiny5", monospace`;
  while (ctx.measureText(str).width > max && s > 20) { s -= 2; ctx.font = `${weight} ${s}px "Tiny5", monospace`; }
  return s;
}

export async function drawCard(r) {
  try {
    await Promise.all([
      document.fonts.load('700 100px "Tiny5"'),
      document.fonts.load('400 40px "Tiny5"'),
    ]);
  } catch { /* fall back to monospace */ }
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#09275B';
  ctx.fillRect(0, 0, W, H);
  pxFrame(ctx, 40, 40, W - 80, H - 80, 8, '#123C82', C.navy);

  // title
  flag(ctx, 170, 128, 7);
  flag(ctx, 826, 128, 7, true);
  text(ctx, 'Type Race', W / 2, 200, { size: 96, color: C.yellow });

  // result card
  const cx = 110; const cy = 270; const cw = W - 220; const ch = 900;
  pxFrame(ctx, cx, cy, cw, ch, 6, '#2894EB', C.navy);
  const first = r.place === 1 || (r.solo && r.best);
  if (first) {
    grid(ctx, GRIDS.TROPHY, { Y: C.yellow, L: '#FFF3A6', D: '#C9A300' }, W / 2 - 80, cy + 44, 10);
    for (const [sx, sy, ss] of [[W / 2 - 170, cy + 94, 7], [W / 2 + 130, cy + 54, 7], [W / 2 - 120, cy + 200, 4], [W / 2 + 110, cy + 180, 4]]) {
      grid(ctx, ['..Y..', '..Y..', 'YYYYY', '..Y..', '..Y..'], { Y: C.yellow }, sx, sy, ss);
    }
  } else {
    car(ctx, r.car || 0, W / 2 - 130, cy + 60, 13);
  }

  const digits = String(Math.round(r.wpm));
  const rows = Array.from({ length: 9 }, (_, y) => [...digits].map((d) => GRIDS.DIGITS[d][y]).join('.'));
  const ds = 26;
  grid(ctx, rows, { X: C.yellow }, W / 2 - (rows[0].length * ds) / 2, cy + 225, ds);
  text(ctx, 'WPM', W / 2, cy + 570, { size: 100, color: C.yellow });

  // ribbon
  const label = r.solo ? (r.best ? 'New best!' : 'Practice') : r.place ? `${ordinal(r.place)} of ${r.of}` : 'Finished';
  ctx.font = '700 64px "Tiny5", monospace';
  const rw = Math.max(380, ctx.measureText(label).width + 120);
  const rx = W / 2 - rw / 2; const ry = cy + 610; const rh = 92;
  ctx.fillStyle = C.sky;
  ctx.beginPath();
  ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw - 30, ry + rh / 2); ctx.lineTo(rx + rw, ry + rh);
  ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + 30, ry + rh / 2); ctx.closePath(); ctx.fill();
  text(ctx, label, W / 2, ry + 66, { size: 64, color: C.ink });
  flag(ctx, rx - 110, ry + 8, 7);
  flag(ctx, rx + rw + 26, ry + 8, 7, true);

  ctx.fillStyle = '#1D66AE';
  ctx.fillRect(cx + 60, cy + 740, cw - 120, 4);
  grid(ctx, GRIDS.SIGHT, { S: C.sky }, W / 2 - 190, cy + 770, 9);
  text(ctx, `${Math.round(r.accuracy)}%`, W / 2 - 70, cy + 828, { size: 76, color: C.white, align: 'left' });
  text(ctx, 'accuracy', W / 2 - 70, cy + 872, { size: 42, color: C.sky, align: 'left', weight: 600 });

  // what was typed
  const what = `${langLabel(r.lang)} · ${r.title}${r.room ? ` · ${r.room}` : ''}`;
  const sz = fitText(ctx, what, W - 200, 46);
  text(ctx, what, W / 2, cy + ch + 66, { size: sz, color: '#8AA6D6', weight: 600 });

  // podium (multiplayer) or the player's car on a road (solo)
  const base = 1690;
  if (r.podium && r.podium.length) {
    const cols = { 1: C.yellow, 2: C.red, 3: C.sky };
    const slots = [{ p: 2, x: 150, h: 170 }, { p: 1, x: 410, h: 230 }, { p: 3, x: 670, h: 130 }];
    for (const sl of slots) {
      const e = r.podium.find((q) => q.place === sl.p);
      if (!e) continue;
      const top = base - sl.h;
      pxBox(ctx, sl.x, top, 260, sl.h, 6, cols[sl.p]);
      pxBox(ctx, sl.x + 12, top + 70, 236, sl.h - 82, 5, C.navy);
      text(ctx, String(sl.p), sl.x + 130, top + 56, { size: 50, color: C.ink });
      const nm = String(e.name).slice(0, 14);
      const ns = fitText(ctx, nm, 220, 38);
      text(ctx, nm, sl.x + 130, top + 70 + Math.min(54, (sl.h - 82) / 2 + 6), { size: ns, color: C.white, weight: 600 });
      if (sl.h > 150) text(ctx, String(Math.round(e.wpm)), sl.x + 130, top + 70 + Math.min(110, sl.h - 92), { size: 44, color: cols[sl.p] });
      pxFrame(ctx, sl.x + 80, top - 112, 100, 100, 5, cols[sl.p], '#0B2F6B');
      avatar(ctx, e.avatar || 0, sl.x + 94, top - 98, 6);
      if (sl.p === 1) grid(ctx, ['Y....Y....Y', 'YY..YYY..YY', 'YYY.YYY.YYY', 'YYYYYYYYYYY', 'DDDDDDDDDDD'], { Y: C.yellow, D: '#C9A300' }, sl.x + 97, top - 160, 6);
    }
  } else {
    ctx.fillStyle = '#0B2C68';
    ctx.fillRect(110, 1400, W - 220, 110);
    ctx.fillStyle = '#9FB3DB';
    for (let x = 130; x < W - 200; x += 70) ctx.fillRect(x, 1451, 36, 8);
    for (let j = 0; j < 9; j++) for (let i = 0; i < 2; i++) { ctx.fillStyle = (i + j) % 2 ? '#0A1638' : '#F3F8FF'; ctx.fillRect(W - 170 + i * 12, 1402 + j * 12, 12, 12); }
    car(ctx, 0, W - 440, 1372, 11);
    ctx.fillStyle = C.yellow;
    ctx.fillRect(110, 1384, W - 580, 10);
  }

  // footer
  text(ctx, 'Think you’re faster? Race me:', W / 2, H - 168, { size: 46, color: C.white, weight: 600 });
  text(ctx, SITE, W / 2, H - 108, { size: 50, color: C.yellow });
  text(ctx, 'made by @souradip.sh', W / 2, H - 62, { size: 34, color: '#8AA6D6', weight: 500 });
  return cv;
}

export async function shareResult(r) {
  const cv = await drawCard(r);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
  const file = new File([blob], `type-race-${Math.round(r.wpm)}wpm.png`, { type: 'image/png' });
  const textLine = r.solo
    ? `${Math.round(r.wpm)} WPM typing ${langLabel(r.lang)} on Type Race. Beat that: https://${SITE}/`
    : `${r.place ? `${ordinal(r.place)} of ${r.of}, ` : ''}${Math.round(r.wpm)} WPM typing ${langLabel(r.lang)} on Type Race. https://${SITE}/`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: textLine }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  // Fallback: show the image (long-press to save on phones) with a download link.
  const url = URL.createObjectURL(blob);
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sheet-in">
    <img src="${url}" alt="Your Type Race result card">
    <p>Long-press the image to save it, or download it.</p>
    <a class="btn btn-yellow" href="${url}" download="${file.name}">Download</a>
    <button class="btn btn-outline" type="button">Close</button></div>`;
  sheet.querySelector('button').addEventListener('click', () => { sheet.remove(); URL.revokeObjectURL(url); });
  sheet.addEventListener('click', (e) => { if (e.target === sheet) { sheet.remove(); URL.revokeObjectURL(url); } });
  document.body.append(sheet);
}
