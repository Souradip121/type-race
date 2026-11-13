-- ============================================================================
-- Type Race: live code-typing races between classmates. Supabase / Postgres.
--
-- Safe to run more than once (idempotent). Every object it creates is prefixed
-- tr_ so it can share a project with other apps.
--
-- Security model
--   * No accounts. Each browser makes a random player token (localStorage) and
--     sends it to the functions below; only its SHA-256 is stored.
--   * A room is reached through its 5-character code (in the share link).
--     Rooms, and everything in them, are deleted 24 hours after creation.
--   * Row-level security is ON for every tr_ table with NO policies, and the
--     API roles have no table privileges. The browser cannot read or write a
--     table directly; it calls the tr_* functions (SECURITY DEFINER,
--     search_path pinned to '').
--   * The server times every race (starts_at is set by tr_start) and computes
--     each finisher's WPM itself in tr_finish. Scores above 250 WPM are
--     rejected and not recorded. Placings come from the database, so every
--     racer sees the same podium.
--   * Live lane progress travels over a public Realtime broadcast channel
--     (topic 'typerace:<CODE>'). It is cosmetic; nothing on it is trusted.
--
-- WPM = (characters typed / 5) per minute. "Characters typed" excludes each
-- line's leading indentation (the app fills it in) and counts every Enter.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.tr_snippets (
  id         text primary key check (id ~ '^[a-z0-9-]{3,40}$'),
  lang       text not null check (lang in ('c', 'python', 'java')),
  title      text not null check (char_length(title) between 1 and 40),
  code       text not null check (char_length(code) between 20 and 800),
  -- what the player types: the code minus every line's leading indentation
  typed_len  integer generated always as
               (char_length(regexp_replace(code, '(^|\n)[ \t]+', '\1', 'g'))) stored,
  position   integer not null default 0
);
create index if not exists tr_snippets_lang_idx on public.tr_snippets (lang, position);

create table if not exists public.tr_rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
  name        text not null check (char_length(name) between 1 and 16),
  lang        text not null default 'python' check (lang in ('c', 'python', 'java')),
  race_seq    integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);
create index if not exists tr_rooms_expires_idx on public.tr_rooms (expires_at);

create table if not exists public.tr_players (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.tr_rooms (id) on delete cascade,
  token_hash  text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  name        text not null check (char_length(name) between 1 and 14),
  car         smallint not null check (car between 0 and 5),
  avatar      smallint not null default 0 check (avatar between 0 and 7),
  joined_at   timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (room_id, token_hash)
);

create table if not exists public.tr_races (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.tr_rooms (id) on delete cascade,
  seq         integer not null,
  snippet_id  text not null references public.tr_snippets (id),
  starts_at   timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (room_id, seq)
);
create index if not exists tr_races_snippet_idx on public.tr_races (snippet_id);

-- One row per racer who was in the room when the race started.
create table if not exists public.tr_entries (
  race_id      uuid not null references public.tr_races (id) on delete cascade,
  player_id    uuid not null references public.tr_players (id) on delete cascade,
  ms           integer check (ms > 0),
  wpm          numeric(5, 1) check (wpm >= 0 and wpm <= 250),
  accuracy     numeric(4, 1) check (accuracy between 0 and 100),
  finished_at  timestamptz,
  primary key (race_id, player_id)
);
create index if not exists tr_entries_player_idx on public.tr_entries (player_id);

-- Lock the tables: RLS on, no policies, no grants to the API roles.
alter table public.tr_snippets enable row level security;
alter table public.tr_rooms    enable row level security;
alter table public.tr_players  enable row level security;
alter table public.tr_races    enable row level security;
alter table public.tr_entries  enable row level security;

revoke all on table public.tr_snippets, public.tr_rooms, public.tr_players,
                    public.tr_races, public.tr_entries
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable from the browser)
-- ---------------------------------------------------------------------------

-- A racer counts as "in the room" if their browser checked in recently.
create or replace function public.tr__active_since()
returns timestamptz
language sql stable set search_path = ''
as $$ select now() - interval '30 seconds' $$;

create or replace function public.tr__hash(p_token text)
returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,64}$' then
    raise exception 'bad_token' using errcode = 'PT400';
  end if;
  return encode(extensions.digest(p_token, 'sha256'), 'hex');
end $$;

create or replace function public.tr__clean(p_text text, p_max int, p_what text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare v text := btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'));
begin
  if char_length(v) = 0 then
    raise exception '%_required', p_what using errcode = 'PT400';
  end if;
  if char_length(v) > p_max then
    raise exception '%_too_long', p_what using errcode = 'PT400';
  end if;
  return v;
end $$;

create or replace function public.tr__lang(p_lang text)
returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if p_lang is null or p_lang not in ('c', 'python', 'java') then
    raise exception 'bad_lang' using errcode = 'PT400';
  end if;
  return p_lang;
end $$;

-- Resolve a live (unexpired) room by code, or fail with HTTP 404.
create or replace function public.tr__room(p_code text)
returns public.tr_rooms
language plpgsql stable security definer set search_path = ''
as $$
declare r public.tr_rooms;
begin
  select * into r from public.tr_rooms
  where code = upper(btrim(coalesce(p_code, ''))) and expires_at > now();
  if r.id is null then
    raise exception 'room_not_found' using errcode = 'PT404';
  end if;
  return r;
end $$;

-- The calling player in a room, or null.
create or replace function public.tr__me(p_room uuid, p_token text)
returns public.tr_players
language sql stable security definer set search_path = ''
as $$
  select * from public.tr_players
  where room_id = p_room and token_hash = public.tr__hash(p_token)
$$;

-- Give a player a car colour (0-5) no other active racer is using.
create or replace function public.tr__assign_car(p_room uuid, p_player uuid)
returns smallint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_car  smallint;
  v_used smallint[];
begin
  select coalesce(array_agg(car), '{}') into v_used from public.tr_players
  where room_id = p_room and id <> p_player and last_seen > public.tr__active_since();
  select car into v_car from public.tr_players where id = p_player;
  if v_car is not null and not (v_car = any (v_used)) then
    return v_car;
  end if;
  select c into v_car from generate_series(0, 5) as c
  where not (c::smallint = any (v_used)) order by c limit 1;
  if v_car is null then
    raise exception 'room_full' using errcode = 'PT409';
  end if;
  update public.tr_players set car = v_car where id = p_player;
  return v_car;
end $$;

-- Is this race finished for everyone (all done, everyone left, or 3 minutes up)?
create or replace function public.tr__race_over(p_race uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select r.starts_at + interval '180 seconds' < now()
      or not exists (
        select 1 from public.tr_entries e
        join public.tr_players p on p.id = e.player_id
        where e.race_id = r.id and e.finished_at is null
          and p.last_seen > public.tr__active_since())
  from public.tr_races r where r.id = p_race
$$;

-- Tell everyone in the room to refetch. Best effort: a failed broadcast never
-- fails the request (clients also poll).
create or replace function public.tr__notify(p_code text, p_kind text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('kind', p_kind), 'sync', 'typerace:' || p_code, false);
exception when others then
  null;
end $$;

-- Everything a client needs to draw the room.
create or replace function public.tr__state(p_room uuid, p_me uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with room as (select * from public.tr_rooms where id = p_room),
  race as (
    select r.* from public.tr_races r where r.room_id = p_room order by r.seq desc limit 1
  ),
  entries as (
    select e.*, p.name, p.car, p.avatar,
           case when e.finished_at is null then null
                else rank() over (partition by (e.finished_at is null) order by e.ms, e.finished_at) end as place
    from public.tr_entries e
    join public.tr_players p on p.id = e.player_id
    where e.race_id = (select id from race)
  )
  select jsonb_build_object(
    'now', now(),
    'me', p_me,
    'room', (select jsonb_build_object('code', code, 'name', name, 'lang', lang,
                                       'expires_at', expires_at) from room),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'car', p.car, 'avatar', p.avatar)
                       order by p.joined_at)
      from public.tr_players p
      where p.room_id = p_room and (p.last_seen > public.tr__active_since() or p.id = p_me)), '[]'::jsonb),
    'race', (
      select jsonb_build_object(
        'id', r.id, 'seq', r.seq, 'starts_at', r.starts_at,
        'over', public.tr__race_over(r.id),
        'snippet', jsonb_build_object('id', s.id, 'lang', s.lang, 'title', s.title,
                                      'code', s.code, 'typed_len', s.typed_len),
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'player_id', e.player_id, 'name', e.name, 'car', e.car, 'avatar', e.avatar,
                   'ms', e.ms, 'wpm', e.wpm, 'accuracy', e.accuracy, 'place', e.place)
                 order by e.place nulls last, e.car)
          from entries e), '[]'::jsonb))
      from race r join public.tr_snippets s on s.id = r.snippet_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- API (callable by anon through PostgREST: POST /rest/v1/rpc/<name>)
-- ---------------------------------------------------------------------------

-- Make a room and join it as its first racer. Returns the room state.
create or replace function public.tr_create_room(
  p_token text, p_room_name text, p_player_name text, p_lang text default 'python', p_avatar int default 0
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hash   text := public.tr__hash(p_token);
  v_room   text := public.tr__clean(p_room_name, 16, 'room_name');
  v_name   text := public.tr__clean(p_player_name, 14, 'name');
  v_lang   text := public.tr__lang(p_lang);
  v_alpha  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code   text;
  v_id     uuid;
  v_me     uuid;
  i        int;
begin
  if p_avatar is null or p_avatar not between 0 and 7 then
    raise exception 'bad_avatar' using errcode = 'PT400';
  end if;
  for attempt in 1..20 loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_alpha, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 31), 1);
    end loop;
    begin
      insert into public.tr_rooms (code, name, lang) values (v_code, v_room, v_lang) returning id into v_id;
      exit;
    exception when unique_violation then
      -- an expired room may still hold the code until the purge job runs
      delete from public.tr_rooms where code = v_code and expires_at <= now();
      v_id := null;
    end;
  end loop;
  if v_id is null then
    raise exception 'try_again' using errcode = 'PT503';
  end if;
  insert into public.tr_players (room_id, token_hash, name, car, avatar)
  values (v_id, v_hash, v_name, 0, p_avatar) returning id into v_me;
  return public.tr__state(v_id, v_me);
end $$;

-- Join a room (or update your name / avatar, or come back after a break).
create or replace function public.tr_join(p_code text, p_token text, p_name text, p_avatar int default 0)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r      public.tr_rooms := public.tr__room(p_code);
  v_hash text := public.tr__hash(p_token);
  v_name text := public.tr__clean(p_name, 14, 'name');
  v_me   uuid;
begin
  if p_avatar is null or p_avatar not between 0 and 7 then
    raise exception 'bad_avatar' using errcode = 'PT400';
  end if;
  perform 1 from public.tr_rooms where id = r.id for update; -- serialise car picks
  select id into v_me from public.tr_players where room_id = r.id and token_hash = v_hash;
  if v_me is null then
    if (select count(*) from public.tr_players
        where room_id = r.id and last_seen > public.tr__active_since()) >= 6 then
      raise exception 'room_full' using errcode = 'PT409';
    end if;
    insert into public.tr_players (room_id, token_hash, name, car, avatar)
    values (r.id, v_hash, v_name, 0, p_avatar) returning id into v_me;
  else
    update public.tr_players set name = v_name, avatar = p_avatar where id = v_me;
  end if;
  perform public.tr__assign_car(r.id, v_me);
  update public.tr_players set last_seen = now() where id = v_me;
  perform public.tr__notify(r.code, 'join');
  return public.tr__state(r.id, v_me);
end $$;

-- Read the room. A racer's call doubles as their "still here" heartbeat.
create or replace function public.tr_state(p_code text, p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r    public.tr_rooms := public.tr__room(p_code);
  me   public.tr_players := public.tr__me(r.id, p_token);
begin
  if me.id is not null then
    if me.last_seen <= public.tr__active_since() then
      -- back after a break: their car may have gone to someone else
      perform 1 from public.tr_rooms where id = r.id for update;
      begin
        perform public.tr__assign_car(r.id, me.id);
      exception when sqlstate 'PT409' then
        return public.tr__state(r.id, null);  -- room filled up meanwhile; must rejoin
      end;
      update public.tr_players set last_seen = now() where id = me.id;
      perform public.tr__notify(r.code, 'join');
    else
      update public.tr_players set last_seen = now() where id = me.id;
    end if;
  end if;
  return public.tr__state(r.id, me.id);
end $$;

-- Leave the room now (the lane disappears for everyone straight away).
create or replace function public.tr_leave(p_code text, p_token text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r  public.tr_rooms := public.tr__room(p_code);
  me public.tr_players := public.tr__me(r.id, p_token);
begin
  if me.id is not null then
    update public.tr_players set last_seen = 'epoch' where id = me.id;
    perform public.tr__notify(r.code, 'leave');
  end if;
end $$;

-- Change the room's language (between races).
create or replace function public.tr_set_lang(p_code text, p_token text, p_lang text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r      public.tr_rooms := public.tr__room(p_code);
  me     public.tr_players := public.tr__me(r.id, p_token);
  v_lang text := public.tr__lang(p_lang);
  v_race uuid;
begin
  if me.id is null then
    raise exception 'not_in_room' using errcode = 'PT403';
  end if;
  select id into v_race from public.tr_races where room_id = r.id order by seq desc limit 1;
  if v_race is not null and not public.tr__race_over(v_race) then
    raise exception 'race_running' using errcode = 'PT409';
  end if;
  update public.tr_rooms set lang = v_lang where id = r.id;
  update public.tr_players set last_seen = now() where id = me.id;
  perform public.tr__notify(r.code, 'lang');
  return public.tr__state(r.id, me.id);
end $$;

-- Start a race (or a rematch) with everyone who is in the room right now.
-- Needs two racers; one person alone practises solo in the browser instead.
create or replace function public.tr_start(p_code text, p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r       public.tr_rooms := public.tr__room(p_code);
  me      public.tr_players := public.tr__me(r.id, p_token);
  v_last  public.tr_races;
  v_snip  text;
  v_race  uuid;
  v_seq   int;
begin
  if me.id is null then
    raise exception 'not_in_room' using errcode = 'PT403';
  end if;
  update public.tr_players set last_seen = now() where id = me.id;
  select * into r from public.tr_rooms where id = r.id for update;  -- one start at a time

  select * into v_last from public.tr_races where room_id = r.id order by seq desc limit 1;
  if v_last.id is not null and not public.tr__race_over(v_last.id) then
    -- someone else pressed Start a moment earlier: join their countdown
    return public.tr__state(r.id, me.id);
  end if;

  if (select count(*) from public.tr_players
      where room_id = r.id and last_seen > public.tr__active_since()) < 2 then
    raise exception 'need_two' using errcode = 'PT409';
  end if;

  -- a snippet in the room's language this room hasn't raced recently
  select s.id into v_snip from public.tr_snippets s
  where s.lang = r.lang
    and s.id not in (select x.snippet_id from public.tr_races x
                     where x.room_id = r.id order by x.seq desc limit 6)
  order by random() limit 1;
  if v_snip is null then
    select s.id into v_snip from public.tr_snippets s where s.lang = r.lang order by random() limit 1;
  end if;
  if v_snip is null then
    raise exception 'no_snippets' using errcode = 'PT500';
  end if;

  v_seq := r.race_seq + 1;
  update public.tr_rooms set race_seq = v_seq where id = r.id;
  insert into public.tr_races (room_id, seq, snippet_id, starts_at)
  values (r.id, v_seq, v_snip, now() + interval '4.5 seconds') returning id into v_race;
  insert into public.tr_entries (race_id, player_id)
  select v_race, p.id from public.tr_players p
  where p.room_id = r.id and p.last_seen > public.tr__active_since();

  perform public.tr__notify(r.code, 'start');
  return public.tr__state(r.id, me.id);
end $$;

-- Record your finish. The server times the race: it accepts your own elapsed
-- time (p_ms) only within 2 seconds of its own clock, to forgive network lag,
-- and refuses anything above 250 WPM.
create or replace function public.tr_finish(
  p_code text, p_token text, p_race uuid, p_ms int, p_accuracy numeric
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r          public.tr_rooms := public.tr__room(p_code);
  me         public.tr_players := public.tr__me(r.id, p_token);
  v_race     public.tr_races;
  v_entry    public.tr_entries;
  v_len      int;
  v_server   int;
  v_ms       int;
  v_wpm      numeric;
begin
  if me.id is null then
    raise exception 'not_in_room' using errcode = 'PT403';
  end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then
    raise exception 'bad_accuracy' using errcode = 'PT400';
  end if;
  select * into v_race from public.tr_races where id = p_race and room_id = r.id for update;
  if v_race.id is null then
    raise exception 'race_not_found' using errcode = 'PT404';
  end if;
  select * into v_entry from public.tr_entries where race_id = v_race.id and player_id = me.id;
  if v_entry.race_id is null then
    raise exception 'not_in_race' using errcode = 'PT403';
  end if;
  if v_entry.finished_at is not null then
    return public.tr__state(r.id, me.id);  -- already recorded (retry after a dropped reply)
  end if;
  if now() > v_race.starts_at + interval '180 seconds' then
    raise exception 'race_over' using errcode = 'PT409';
  end if;

  v_server := floor(extract(epoch from (clock_timestamp() - v_race.starts_at)) * 1000);
  if v_server <= 0 then
    raise exception 'impossible_score' using errcode = 'PT422';
  end if;
  v_ms := least(v_server, greatest(coalesce(p_ms, v_server), v_server - 2000));
  if v_ms <= 0 then
    raise exception 'impossible_score' using errcode = 'PT422';
  end if;
  select typed_len into v_len from public.tr_snippets where id = v_race.snippet_id;
  v_wpm := round((v_len / 5.0) / (v_ms / 60000.0), 1);
  if v_wpm > 250 then
    raise exception 'impossible_score' using errcode = 'PT422',
      detail = format('%s WPM is faster than any human types code', v_wpm);
  end if;

  update public.tr_entries
  set ms = v_ms, wpm = v_wpm, accuracy = round(p_accuracy, 1), finished_at = clock_timestamp()
  where race_id = v_race.id and player_id = me.id;
  update public.tr_players set last_seen = now() where id = me.id;
  perform public.tr__notify(r.code, 'finish');
  return public.tr__state(r.id, me.id);
end $$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke execute on function
  public.tr__active_since(), public.tr__hash(text), public.tr__clean(text, int, text),
  public.tr__lang(text), public.tr__room(text), public.tr__me(uuid, text),
  public.tr__assign_car(uuid, uuid), public.tr__race_over(uuid),
  public.tr__notify(text, text), public.tr__state(uuid, uuid),
  public.tr_create_room(text, text, text, text, int), public.tr_join(text, text, text, int),
  public.tr_state(text, text), public.tr_leave(text, text), public.tr_set_lang(text, text, text),
  public.tr_start(text, text), public.tr_finish(text, text, uuid, int, numeric)
from public, anon, authenticated;

grant execute on function
  public.tr_create_room(text, text, text, text, int), public.tr_join(text, text, text, int),
  public.tr_state(text, text), public.tr_leave(text, text), public.tr_set_lang(text, text, text),
  public.tr_start(text, text), public.tr_finish(text, text, uuid, int, numeric)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rooms expire after 24 hours: an hourly pg_cron job deletes them (and their
-- racers, races and results). Expired rooms are already unreachable before
-- the job runs. Skipped quietly if pg_cron is not enabled.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tr_purge_expired_rooms', '17 * * * *',
      $job$delete from public.tr_rooms where expires_at < now()$job$);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Snippets (generated from assets/js/snippets.js by scripts/snippets-sql.mjs;
-- edit that file, then run `node scripts/snippets-sql.mjs`)
-- ---------------------------------------------------------------------------

-- BEGIN SNIPPETS
insert into public.tr_snippets (id, lang, title, code, position) values
  ('c-binary-search', 'c', 'Binary search', $c$int bs(int a[], int l, int r, int x) {
    if (l > r) return -1;
    int m = (l + r) / 2;
    if (a[m] == x) return m;
    if (a[m] < x) l = m + 1;
    else r = m - 1;
    return bs(a, l, r, x);
}$c$, 1),
  ('c-bubble-sort', 'c', 'Bubble sort', $c$void bubble_sort(int a[], int n) {
    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - 1 - i; j++)
            if (a[j] > a[j + 1])
                swap(&a[j], &a[j + 1]);
}$c$, 2),
  ('c-swap', 'c', 'Swap with pointers', $c$void swap(int *a, int *b) {
    int t = *a;
    *a = *b;
    *b = t;
}$c$, 3),
  ('c-list-push', 'c', 'Linked list: insert at head', $c$Node *push(Node *head, int v) {
    Node *n = malloc(sizeof(Node));
    n->data = v;
    n->next = head;
    return n;
}$c$, 4),
  ('c-list-append', 'c', 'Linked list: insert at end', $c$Node *append(Node *head, Node *n) {
    if (head == NULL) return n;
    Node *cur = head;
    while (cur->next) cur = cur->next;
    cur->next = n;
    return head;
}$c$, 5),
  ('c-list-reverse', 'c', 'Reverse a linked list', $c$Node *reverse(Node *h) {
    Node *prev = NULL, *next;
    while (h) {
        next = h->next; h->next = prev;
        prev = h; h = next;
    }
    return prev;
}$c$, 6),
  ('c-factorial', 'c', 'Factorial', $c$long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}$c$, 7),
  ('c-gcd', 'c', 'GCD (Euclid)', $c$int gcd(int a, int b) {
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}$c$, 8),
  ('c-is-prime', 'c', 'Prime check', $c$int is_prime(int n) {
    if (n < 2) return 0;
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return 0;
    return 1;
}$c$, 9),
  ('c-strlen', 'c', 'String length', $c$int str_len(const char *s) {
    int n = 0;
    while (s[n] != '\0') n++;
    return n;
}$c$, 10),
  ('c-reverse-string', 'c', 'Reverse a string', $c$void reverse_str(char *s) {
    int i = 0, j = strlen(s) - 1;
    while (i < j) {
        char t = s[i];
        s[i++] = s[j];
        s[j--] = t;
    }
}$c$, 11),
  ('c-fibonacci', 'c', 'Fibonacci', $c$int fib(int n) {
    int a = 0, b = 1, t;
    while (n-- > 0) {
        t = a + b; a = b; b = t;
    }
    return a;
}$c$, 12),
  ('c-max', 'c', 'Largest element', $c$int max_of(int a[], int n) {
    int m = a[0];
    for (int i = 1; i < n; i++)
        if (a[i] > m) m = a[i];
    return m;
}$c$, 13),
  ('c-digit-sum', 'c', 'Sum of digits', $c$int digit_sum(int n) {
    int s = 0;
    while (n > 0) {
        s += n % 10;
        n /= 10;
    }
    return s;
}$c$, 14),
  ('py-binary-search', 'python', 'Binary search', $c$def binary_search(a, x):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == x: return mid
        if a[mid] < x: lo = mid + 1
        else: hi = mid - 1
    return -1$c$, 1),
  ('py-bubble-sort', 'python', 'Bubble sort', $c$def bubble_sort(a):
    n = len(a)
    for i in range(n):
        for j in range(n - i - 1):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
    return a$c$, 2),
  ('py-list-append', 'python', 'Linked list: insert at end', $c$def append(head, val):
    if head is None:
        return Node(val)
    cur = head
    while cur.next:
        cur = cur.next
    cur.next = Node(val)
    return head$c$, 3),
  ('py-list-reverse', 'python', 'Reverse a linked list', $c$def reverse(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev, head = head, nxt
    return prev$c$, 4),
  ('py-factorial', 'python', 'Factorial', $c$def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)$c$, 5),
  ('py-fibonacci', 'python', 'Fibonacci', $c$def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a$c$, 6),
  ('py-gcd', 'python', 'GCD (Euclid)', $c$def gcd(a, b):
    while b:
        a, b = b, a % b
    return a$c$, 7),
  ('py-is-prime', 'python', 'Prime check', $c$def is_prime(n):
    if n < 2:
        return False
    for i in range(2, int(n ** 0.5) + 1):
        if n % i == 0:
            return False
    return True$c$, 8),
  ('py-palindrome', 'python', 'Palindrome check', $c$def is_palindrome(s):
    i, j = 0, len(s) - 1
    while i < j:
        if s[i] != s[j]:
            return False
        i, j = i + 1, j - 1
    return True$c$, 9),
  ('py-insertion-sort', 'python', 'Insertion sort', $c$def insertion_sort(a):
    for i in range(1, len(a)):
        key, j = a[i], i - 1
        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key
    return a$c$, 10),
  ('py-count-vowels', 'python', 'Count vowels', $c$def count_vowels(s):
    count = 0
    for ch in s.lower():
        if ch in "aeiou":
            count += 1
    return count$c$, 11),
  ('py-digit-sum', 'python', 'Sum of digits', $c$def digit_sum(n):
    total = 0
    while n > 0:
        total += n % 10
        n //= 10
    return total$c$, 12),
  ('java-binary-search', 'java', 'Binary search', $c$int bs(int[] a, int l, int r, int x) {
    if (l > r) return -1;
    int m = (l + r) / 2;
    if (a[m] == x) return m;
    if (a[m] < x) l = m + 1;
    else r = m - 1;
    return bs(a, l, r, x);
}$c$, 1),
  ('java-bubble-sort', 'java', 'Bubble sort', $c$void bubbleSort(int[] a) {
    for (int i = a.length - 1; i > 0; i--)
        for (int j = 0; j < i; j++)
            if (a[j] > a[j + 1])
                swap(a, j, j + 1);
}$c$, 2),
  ('java-swap', 'java', 'Swap in an array', $c$void swap(int[] a, int i, int j) {
    int t = a[i];
    a[i] = a[j];
    a[j] = t;
}$c$, 3),
  ('java-list-push', 'java', 'Linked list: insert at head', $c$Node push(Node head, int val) {
    Node n = new Node(val);
    n.next = head;
    return n;
}$c$, 4),
  ('java-list-append', 'java', 'Linked list: insert at end', $c$Node add(Node h, int v) {
    if (h == null) return new Node(v);
    Node c = h;
    while (c.next != null) c = c.next;
    c.next = new Node(v);
    return h;
}$c$, 5),
  ('java-list-reverse', 'java', 'Reverse a linked list', $c$Node reverse(Node h) {
    Node prev = null;
    while (h != null) {
        Node next = h.next;
        h.next = prev; prev = h; h = next;
    }
    return prev;
}$c$, 6),
  ('java-factorial', 'java', 'Factorial', $c$long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}$c$, 7),
  ('java-fibonacci', 'java', 'Fibonacci', $c$int fib(int n) {
    int a = 0, b = 1;
    for (int i = 0; i < n; i++) {
        int t = a + b;
        a = b; b = t;
    }
    return a;
}$c$, 8),
  ('java-palindrome', 'java', 'Palindrome check', $c$boolean isPalindrome(String s) {
    int i = 0, j = s.length() - 1;
    while (i < j)
        if (s.charAt(i++) != s.charAt(j--))
            return false;
    return true;
}$c$, 9),
  ('java-gcd', 'java', 'GCD (recursive)', $c$int gcd(int a, int b) {
    if (b == 0) return a;
    return gcd(b, a % b);
}$c$, 10),
  ('java-is-prime', 'java', 'Prime check', $c$boolean isPrime(int n) {
    if (n < 2) return false;
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return false;
    return true;
}$c$, 11),
  ('java-count-vowels', 'java', 'Count vowels', $c$int countVowels(String s) {
    int count = 0;
    for (char c : s.toCharArray())
        if ("aeiouAEIOU".indexOf(c) != -1)
            count++;
    return count;
}$c$, 12),
  ('java-max', 'java', 'Largest element', $c$int max(int[] a) {
    int m = a[0];
    for (int x : a)
        if (x > m) m = x;
    return m;
}$c$, 13),
  ('java-insertion-sort', 'java', 'Insertion sort', $c$void insertionSort(int[] a) {
    for (int i = 1; i < a.length; i++) {
        int key = a[i], j = i - 1;
        while (j >= 0 && a[j] > key)
            a[j + 1] = a[j--];
        a[j + 1] = key;
    }
}$c$, 14)
on conflict (id) do update
  set lang = excluded.lang, title = excluded.title, code = excluded.code, position = excluded.position;
-- END SNIPPETS

notify pgrst, 'reload schema';
