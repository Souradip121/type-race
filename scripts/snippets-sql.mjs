// Copies the snippets in assets/js/snippets.js into schema.sql, between the
// "-- BEGIN SNIPPETS" and "-- END SNIPPETS" markers, so the database (which
// times races and needs each snippet's typed length) has the same texts.
//
//   node scripts/snippets-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SNIPPETS } from '../assets/js/snippets.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'schema.sql');
const sql = readFileSync(file, 'utf8');

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const dollar = (s) => {
  if (s.includes('$c$')) throw new Error('snippet contains $c$');
  return `$c$${s}$c$`;
};

const pos = {};
const rows = SNIPPETS.map((s) => {
  pos[s.lang] = (pos[s.lang] || 0) + 1;
  return `  (${q(s.id)}, ${q(s.lang)}, ${q(s.title)}, ${dollar(s.code)}, ${pos[s.lang]})`;
});

const block = `-- BEGIN SNIPPETS
insert into public.tr_snippets (id, lang, title, code, position) values
${rows.join(',\n')}
on conflict (id) do update
  set lang = excluded.lang, title = excluded.title, code = excluded.code, position = excluded.position;
-- END SNIPPETS`;

const next = sql.replace(/-- BEGIN SNIPPETS[\s\S]*?-- END SNIPPETS/, block);
if (next === sql && !sql.includes(block)) throw new Error('markers not found in schema.sql');
writeFileSync(file, next);
console.log(`schema.sql: ${SNIPPETS.length} snippets`);
