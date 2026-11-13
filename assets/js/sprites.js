// Pixel art for Type Race, drawn as character grids and rendered to crisp SVG
// (one <rect> per horizontal run). Everything here is authored for this app.

export const C = {
  navy: '#021842',
  navyDeep: '#011236',
  ink: '#0A1638',
  sky: '#53C0FB',
  skyLine: '#2894EB',
  yellow: '#FCDD3A',
  red: '#F84D55',
  white: '#E3F0FE',
};

// Six cars, in the order the server hands out car numbers 0-5.
export const CARS = [
  { name: 'yellow', B: '#FCDB24', D: '#C9A300', L: '#FFF07A', W: '#FFF7CC', trail: '#FADF31' },
  { name: 'red',    B: '#F84D55', D: '#B52A35', L: '#FF8D92', W: '#FFD5D8', trail: '#F65161' },
  { name: 'sky',    B: '#4FBAFE', D: '#2475BD', L: '#A6DEFF', W: '#DDF2FF', trail: '#4EBDF7' },
  { name: 'white',  B: '#DEEEFE', D: '#93A9C9', L: '#FFFFFF', W: '#8DB5E8', trail: '#E0EFFE' },
  { name: 'mint',   B: '#3FD69E', D: '#1E8F68', L: '#98F2CF', W: '#D4FAEA', trail: '#47DBA4' },
  { name: 'orange', B: '#FF9A3D', D: '#C2611A', L: '#FFC992', W: '#FFE6CC', trail: '#FF9F4A' },
];

const CAR_GRID = [
  '......KKKKKKKK......',
  '.....KBBBBBBBBK.....',
  '....KBWWWKWWWWBK....',
  '...KBWWWWKWWWWWBK...',
  '.KKBBBBBBBBBBBBBBKK.',
  'KRBLLLLLLLLLLLLLLBYK',
  'KBBBBBBBBBBBBBBBBBBK',
  'KDDTTTTDDDDDDTTTTDDK',
  '.KKTHHTKKKKKKTHHTKK.',
  '...TTTT......TTTT...',
  '..SSSSSSSSSSSSSSSS..',
];

// Avatars: 16x16 head-and-shoulders portraits, cropped by the frame's bottom edge.
// h hair, s skin, e eyes, m mouth, c shirt, g glasses, p cap, b cap brim, y hair clip.
const AVATARS = [
  { // 0 short hair
    grid: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '..hhhhhhhhhhhh..',
      '..hhsssssssshh..',
      '..hssssssssssh..',
      '..sssessssesss..',
      '..sssessssesss..',
      '...ssssssssss...',
      '...sssmmmmsss...',
      '....ssssssss....',
      '..ccccsssscccc..',
      '.cccccccccccccc.',
      'cccccccccccccccc',
      'cccccccccccccccc',
    ], h: '#1B1F33', s: '#D9A066', c: '#FCDD3A' },
  { // 1 long hair
    grid: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhsssssssshhh.',
      '.hhsssssssssshh.',
      '.hhssessssesshh.',
      '.hhssessssesshh.',
      '.hhsssssssssshh.',
      '.hhsssmmmmssshh.',
      '.hhhsssssssshhh.',
      '.hhcccsssscccchh',
      'hhcccccccccccchh',
      'hhcccccccccccchh',
      'hcccccccccccccch',
    ], h: '#5B2333', s: '#E8B47E', c: '#FCDD3A' },
  { // 2 side part
    grid: [
      '................',
      '......hhhhhh....',
      '....hhhhhhhhhh..',
      '..hhhhhhhhhhhhh.',
      '..hhhhhhhhhhhhh.',
      '..hhhhhsssssshh.',
      '..hssssssssssh..',
      '..sssessssesss..',
      '..sssessssesss..',
      '...ssssssssss...',
      '...sssmmmmsss...',
      '....ssssssss....',
      '..ccccsssscccc..',
      '.cccccccccccccc.',
      'cccccccccccccccc',
      'cccccccccccccccc',
    ], h: '#14306E', s: '#C68642', c: '#4FBAFE' },
  { // 3 glasses
    grid: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '..hhhhhhhhhhhh..',
      '..hhsssssssshh..',
      '..hssssssssssh..',
      '..sggggggggggs..',
      '..sgsegssgesgs..',
      '..sggggssggggs..',
      '...sssmmmmsss...',
      '....ssssssss....',
      '..ccccsssscccc..',
      '.cccccccccccccc.',
      'cccccccccccccccc',
      'cccccccccccccccc',
    ], h: '#1B1F33', s: '#E2AC74', c: '#4FBAFE', g: '#0A1638' },
  { // 4 bun
    grid: [
      '......hhhh......',
      '......hhhh......',
      '....hhhhhhhh....',
      '..hhhhhhhhhhhh..',
      '..hhhhhhhhhhhh..',
      '..hhsssssssshh..',
      '..hssssssssssh..',
      '..sssessssesss..',
      '..sssessssesss..',
      '...ssssssssss...',
      '...sssmmmmsss...',
      '....ssssssss....',
      '..ccccsssscccc..',
      '.cccccccccccccc.',
      'cccccccccccccccc',
      'cccccccccccccccc',
    ], h: '#2B1A14', s: '#8D5524', c: '#F84D55' },
  { // 5 cap
    grid: [
      '................',
      '.....pppppp.....',
      '...pppppppppp...',
      '..pppppppppppp..',
      '..ppppppppppbbbb',
      '..hhsssssssshh..',
      '..hssssssssssh..',
      '..sssessssesss..',
      '..sssessssesss..',
      '...ssssssssss...',
      '...sssmmmmsss...',
      '....ssssssss....',
      '..ccccsssscccc..',
      '.cccccccccccccc.',
      'cccccccccccccccc',
      'cccccccccccccccc',
    ], h: '#1B1F33', s: '#C68642', c: '#E3F0FE', p: '#F84D55', b: '#B52A35' },
  { // 6 curly
    grid: [
      '....hh.hh.hh....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhsssssssshhh.',
      '..hssssssssssh..',
      '..sssessssesss..',
      '..sssessssesss..',
      '...ssssssssss...',
      '...sssmmmmsss...',
      '....ssssssss....',
      '..ccccsssscccc..',
      '.cccccccccccccc.',
      'cccccccccccccccc',
      'cccccccccccccccc',
    ], h: '#2A1A12', s: '#B07240', c: '#E3F0FE' },
  { // 7 long hair, clip
    grid: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhyy...',
      '..hhhhhhhhhyyh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhsssssssshhh.',
      '.hhsssssssssshh.',
      '.hhssessssesshh.',
      '.hhssessssesshh.',
      '.hhsssssssssshh.',
      '.hhsssmmmmssshh.',
      '.hhhsssssssshhh.',
      '.hhcccsssscccchh',
      'hhcccccccccccchh',
      'hhcccccccccccchh',
      'hcccccccccccccch',
    ], h: '#1B1F33', s: '#D9A066', c: '#45D6A0', y: '#FCDD3A' },
];
export const AVATAR_COUNT = AVATARS.length;

const FLAG = (() => {
  const rows = [];
  for (let y = 0; y < 12; y++) {
    let r = '';
    for (let x = 0; x < 12; x++) {
      if (x < 2) r += y === 0 && x === 1 ? 'P' : 'P';
      else if (y >= 1 && y <= 8) r += (((x - 2) >> 1) + ((y - 1) >> 1)) % 2 ? 'N' : 'W';
      else r += '.';
    }
    rows.push(r);
  }
  return rows;
})();

const TROPHY = [
  '..YYYYYYYYYYYY..',
  '..YLLYYYYYYYDY..',
  'YYYLYYYYYYYYDYYY',
  'Y.YLYYYYYYYYDY.Y',
  'Y.YLYYYYYYYYDY.Y',
  'YY.LYYYYYYYYD.YY',
  '..YYLYYYYYYDYY..',
  '...YYLYYYYDYY...',
  '.....YYYYYY.....',
  '......YYDY......',
  '......YYDY......',
  '.....YYYYYY.....',
  '....YLYYYYDY....',
  '...YYYYYYYYYY...',
  '...DDDDDDDDDD...',
];

const CROWN = [
  'Y....Y....Y',
  'YY..YYY..YY',
  'YYY.YYY.YYY',
  'YYYYYYYYYYY',
  'DDDDDDDDDDD',
];

const BOLT = [
  '...YYYY',
  '..YYYY.',
  '..YYY..',
  '.YYYYYY',
  'YYYYYY.',
  '...YYY.',
  '..YYY..',
  '..YY...',
  '.YY....',
  '.Y.....',
  'Y......',
];

const SIGHT = [
  '....SSS....',
  '..SS.S.SS..',
  '.S...S...S.',
  '.S.......S.',
  'S.........S',
  'SSS..S..SSS',
  'S.........S',
  '.S.......S.',
  '.S...S...S.',
  '..SS.S.SS..',
  '....SSS....',
];

const SPARK = [
  '..Y..',
  '..Y..',
  'YYYYY',
  '..Y..',
  '..Y..',
];

const ICONS = {
  rematch: [
    '...XXXXX...',
    '..XX...XXXX',
    '.XX.....XXX',
    'XX.....XXXX',
    'X..........',
    'X.........X',
    '..........X',
    'XXXX.....XX',
    'XXX.....XX.',
    'XXXX...XX..',
    '...XXXXX...',
  ],
  share: [
    '........XX.',
    '.......XXXX',
    '.....XXXXXX',
    '...XX..XX..',
    'XXX........',
    'XXXX.......',
    'XXX........',
    '...XX..XX..',
    '.....XXXXXX',
    '.......XXXX',
    '........XX.',
  ],
  link: [
    '.....XXXX..',
    '....XX..XX.',
    '....X....X.',
    '.......XXX.',
    '..X...XX...',
    '..X..X..X..',
    '...XX...X..',
    '.XXX.......',
    '.X....X....',
    '.XX..XX....',
    '..XXXX.....',
  ],
  back: [
    '....XX.....',
    '...XX......',
    '..XX.......',
    '.XX........',
    'XXXXXXXXXXX',
    'XXXXXXXXXXX',
    '.XX........',
    '..XX.......',
    '...XX......',
    '....XX.....',
  ],
  enter: [
    '......XX',
    '......XX',
    '..X...XX',
    '.XX...XX',
    'XXXXXXXX',
    '.XX.....',
    '..X.....',
  ],
  keyboard: [
    'XXXXXXXXXXXXX',
    'X...........X',
    'X.X.X.X.X.X.X',
    'X...........X',
    'X..X.X.X.X..X',
    'X...........X',
    'X...XXXXX...X',
    'X...........X',
    'XXXXXXXXXXXXX',
  ],
  cross: [
    'XX...XX',
    'XXX.XXX',
    '.XXXXX.',
    '..XXX..',
    '.XXXXX.',
    'XXX.XXX',
    'XX...XX',
  ],
  play: [
    'XX......',
    'XXXX....',
    'XXXXXX..',
    'XXXXXXXX',
    'XXXXXX..',
    'XXXX....',
    'XX......',
  ],
};

function render(grid, palette, { title = '', cls = '' } = {}) {
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  let rects = '';
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const fill = palette[ch];
      if (!fill || ch === '.') { x++; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`;
      x += run;
    }
  });
  const label = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg class="px ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" ${label}>${rects}</svg>`;
}

export function carSVG(car, opts = {}) {
  const k = CARS[car % CARS.length];
  return render(CAR_GRID, {
    K: '#0A1230', B: k.B, D: k.D, L: k.L, W: k.W,
    T: '#0E1222', H: '#C8D3E6', Y: '#FFF6B8', R: '#FF4D4D', S: 'rgba(0,6,24,.45)',
  }, { cls: `car ${opts.cls || ''}`, title: opts.title || '' });
}

export function avatarSVG(i, opts = {}) {
  const a = AVATARS[((i % AVATARS.length) + AVATARS.length) % AVATARS.length];
  return render(a.grid, {
    h: a.h, s: a.s, e: '#0A1230', m: '#9A3B2E', c: a.c, g: a.g || '#0A1230',
    p: a.p || a.h, b: a.b || a.h, y: a.y || a.h,
  }, { cls: `avatar ${opts.cls || ''}` });
}

export const flagSVG = (cls = '', ink = false) => render(FLAG, ink
  ? { P: '#0A1638', W: 'rgba(10,22,56,.18)', N: '#0A1638' }
  : { P: '#C8D3E6', W: '#F3F8FF', N: '#0A1230' }, { cls: `flag ${cls}` });
export const trophySVG = () => render(TROPHY, { Y: C.yellow, L: '#FFF3A6', D: '#C9A300' }, { cls: 'trophy' });
export const crownSVG = () => render(CROWN, { Y: C.yellow, D: '#C9A300' }, { cls: 'crown' });
export const boltSVG = () => render(BOLT, { Y: C.yellow }, { cls: 'bolt' });
export const sightSVG = () => render(SIGHT, { S: C.sky }, { cls: 'sight' });
export const sparkSVG = (cls = '') => render(SPARK, { Y: C.yellow }, { cls: `spark ${cls}` });
export const iconSVG = (name, color = 'currentColor', cls = '') => render(ICONS[name], { X: color }, { cls: `icon icon-${name} ${cls}` });

// The wordmark, drawn on a 6-wide grid like the digits: capitals 9 art pixels
// tall, lowercase 6, descenders 2.
const LETTERS = {
  T: ['XXXXXX', 'XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '......', '......'],
  R: ['XXXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XXXXX.', 'XXXXX.', 'XX.XX.', 'XX..XX', 'XX..XX', '......', '......'],
  y: ['......', '......', '......', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XXXXXX', '.XXXXX', '....XX', 'XXXXX.'],
  p: ['......', '......', '......', 'XXXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XXXXXX', 'XXXXX.', 'XX....', 'XX....'],
  e: ['......', '......', '......', '.XXXX.', 'XXXXXX', 'XX..XX', 'XXXXXX', 'XX....', '.XXXXX', '......', '......'],
  a: ['......', '......', '......', '.XXXX.', '....XX', '.XXXXX', 'XX..XX', 'XX..XX', '.XXXXX', '......', '......'],
  c: ['......', '......', '......', '.XXXXX', 'XXXXXX', 'XX....', 'XX....', 'XXXXXX', '.XXXXX', '......', '......'],
  ' ': ['..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..'],
};
export function wordRows(text = 'Type Race') {
  return Array.from({ length: 11 }, (_, y) => [...text].map((ch) => LETTERS[ch][y]).join('.'));
}
export const wordmarkSVG = (text = 'Type Race', color = '#FCDD3A') =>
  render(wordRows(text), { X: color }, { cls: 'wordmark', title: text });

// Chunky 6x9 digits for the big numbers (the font's large 8 breaks up).
const DIGITS = {
  0: ['.XXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XXXXXX', '.XXXX.'],
  1: ['..XX..', '.XXX..', 'XXXX..', '..XX..', '..XX..', '..XX..', '..XX..', 'XXXXXX', 'XXXXXX'],
  2: ['.XXXX.', 'XXXXXX', 'XX..XX', '....XX', '..XXX.', '.XXX..', 'XXX...', 'XXXXXX', 'XXXXXX'],
  3: ['.XXXX.', 'XXXXXX', 'XX..XX', '....XX', '..XXX.', '....XX', 'XX..XX', 'XXXXXX', '.XXXX.'],
  4: ['XX..XX', 'XX..XX', 'XX..XX', 'XXXXXX', 'XXXXXX', '....XX', '....XX', '....XX', '....XX'],
  5: ['XXXXXX', 'XXXXXX', 'XX....', 'XXXXX.', 'XXXXXX', '....XX', 'XX..XX', 'XXXXXX', '.XXXX.'],
  6: ['.XXXX.', 'XXXXXX', 'XX....', 'XXXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XXXXXX', '.XXXX.'],
  7: ['XXXXXX', 'XXXXXX', '....XX', '...XX.', '..XX..', '..XX..', '.XX...', '.XX...', '.XX...'],
  8: ['.XXXX.', 'XXXXXX', 'XX..XX', 'XXXXXX', '.XXXX.', 'XX..XX', 'XX..XX', 'XXXXXX', '.XXXX.'],
  9: ['.XXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XXXXXX', '.XXXXX', '....XX', 'XXXXXX', '.XXXX.'],
  '%': ['....', '....', '....', 'XX.X', 'XX.X', '..X.', '.X..', 'X.XX', 'X.XX'],
};
export function numSVG(n, color = 'currentColor', cls = '') {
  const str = String(n).replace(/[^0-9%]/g, '') || '0';
  const rows = Array.from({ length: 9 }, (_, y) => [...str].map((d) => DIGITS[d][y]).join('.'));
  return render(rows, { X: color }, { cls: `num ${cls}`, title: str });
}

// Raw grids for the share-card canvas.
export const GRIDS = { CAR_GRID, AVATARS, FLAG, TROPHY, CROWN, BOLT, SIGHT, DIGITS, wordRows };

// ---------------------------------------------------------------------------
// Pixel frames: a 12x12 nine-slice with stepped corners, used as border-image.
// ---------------------------------------------------------------------------
const OUTER = '3,0 9,0 9,1 11,1 11,3 12,3 12,9 11,9 11,11 9,11 9,12 3,12 3,11 1,11 1,9 0,9 0,3 1,3 1,1 3,1';
const INNER = '3,1 9,1 9,2 10,2 10,3 11,3 11,9 10,9 10,10 9,10 9,11 3,11 3,10 2,10 2,9 1,9 1,3 2,3 2,2 3,2';

export function frameURL({ stroke, fill = 'none', lip = null }) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" shape-rendering="crispEdges">`;
  svg += `<polygon points="${OUTER}" fill="${stroke}"/>`;
  svg += `<polygon points="${INNER}" fill="${fill === 'none' ? C.navy : fill}"${fill === 'none' ? ' fill-opacity="0"' : ''}/>`;
  if (lip) svg += `<polygon points="1,9 11,9 11,10 10,10 10,11 2,11 2,10 1,10" fill="${lip}"/>`;
  svg += '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Outline frames need the inner area knocked out (transparent), not painted.
function hollowURL(stroke) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" shape-rendering="crispEdges">` +
    `<path fill-rule="evenodd" fill="${stroke}" d="M${OUTER.split(' ').join(' L')} Z M${INNER.split(' ').join(' L')} Z"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function installFrames(root = document.documentElement) {
  const set = (k, v) => root.style.setProperty(k, v);
  set('--f-card', hollowURL(C.skyLine));
  set('--f-chip', hollowURL('#1D66AE'));
  set('--f-chip-on', frameURL({ stroke: C.sky, fill: C.sky }));
  set('--f-yellow', frameURL({ stroke: C.yellow, fill: C.yellow, lip: '#D8B419' }));
  set('--f-yellow-down', frameURL({ stroke: C.yellow, fill: C.yellow }));
  set('--f-outline', hollowURL('#3C8FD0'));
  set('--f-avatar', frameURL({ stroke: C.skyLine, fill: '#0B2F6B' }));
  set('--f-avatar-red', frameURL({ stroke: C.red, fill: '#3A1630' }));
  set('--f-avatar-yellow', frameURL({ stroke: C.sky, fill: '#0B2F6B' }));
  set('--f-pod-1', frameURL({ stroke: C.yellow, fill: C.yellow }));
  set('--f-pod-2', frameURL({ stroke: C.red, fill: C.red }));
  set('--f-pod-3', frameURL({ stroke: C.sky, fill: C.sky }));
  set('--f-pod-panel', frameURL({ stroke: '#0A1638', fill: C.navy }));
  set('--f-field', frameURL({ stroke: C.skyLine, fill: '#04204F' }));
  set('--f-field-focus', frameURL({ stroke: C.yellow, fill: '#04204F' }));
  set('--f-badge', frameURL({ stroke: '#0A1638', fill: '#0A1638' }));
  set('--f-red', frameURL({ stroke: C.red, fill: '#2A0F2A' }));
}
