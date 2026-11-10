-- Fantasy golf league: database schema.
-- Run once in the Supabase SQL editor of a NEW project.
--
-- Security model (same idea as the NFL app, locked down from day one):
--   * Row level security is ON for every table and the anon key has NO direct table access.
--   * The browser only calls the functions below (security definer), which check an owner PIN
--     or the commissioner PIN.
--   * PINs are stored hashed (bcrypt via pgcrypto), never in plain text.
--   * Swaps are locked on the server at the tournament's first tee time.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table if not exists season (
  id          int primary key,            -- e.g. 2027
  name        text not null,
  entry_fee   numeric not null default 30,
  weekly_prize numeric not null default 5,
  is_current  boolean not null default false
);

create table if not exists owner (
  id          bigint generated always as identity primary key,
  season_id   int not null references season(id),
  name        text not null,
  email       text,
  pin_hash    text not null,
  paid        boolean not null default false,
  unique (season_id, name)
);

-- Golfer pool for a season, with the flight each golfer belongs to.
create table if not exists golfer (
  id          bigint generated always as identity primary key,
  season_id   int not null references season(id),
  name        text not null,
  flight      text not null check (flight in ('SUPER','A','B','C','D','E')),
  unique (season_id, name)
);

-- Alternate spellings from results feeds, mapped to our golfer name.
create table if not exists golfer_alias (
  season_id   int not null references season(id),
  alias       text not null,
  golfer_name text not null,
  primary key (season_id, alias)
);

-- Each owner's starter and alternate per flight, as drafted before the season.
create table if not exists roster_slot (
  owner_id    bigint not null references owner(id) on delete cascade,
  flight      text not null check (flight in ('SUPER','A','B','C','D','E')),
  starter     text not null,
  alternate   text not null,
  primary key (owner_id, flight)
);

create table if not exists tournament (
  season_id   int not null references season(id),
  id          int not null,               -- 1, 2, 3 ... in season order
  name        text not null,
  start_date  date not null,
  lock_at     timestamptz not null,       -- first tee time; swaps close at this moment
  purse       numeric,
  field_url   text,
  espn_event_id text,                     -- used to pull results automatically
  status      text not null default 'upcoming' check (status in ('upcoming','in_progress','final')),
  primary key (season_id, id)
);

-- kind: 'week' = alternate counts for this tournament only; 'permanent' = starter and alternate trade places from here on.
create table if not exists swap (
  id            bigint generated always as identity primary key,
  owner_id      bigint not null references owner(id) on delete cascade,
  season_id     int not null,
  tournament_id int not null,
  flight        text not null check (flight in ('SUPER','A','B','C','D','E')),
  kind          text not null check (kind in ('week','permanent')),
  created_at    timestamptz not null default now(),
  created_by    text not null default 'owner',   -- 'owner' or 'commissioner'
  foreign key (season_id, tournament_id) references tournament(season_id, id),
  unique (owner_id, tournament_id, flight)
);

-- One row per golfer per tournament. earnings null = in the field but no money (missed cut, WD, DQ).
create table if not exists result (
  season_id     int not null,
  tournament_id int not null,
  golfer_name   text not null,
  position      text,
  earnings      numeric,
  foreign key (season_id, tournament_id) references tournament(season_id, id),
  primary key (season_id, tournament_id, golfer_name)
);

create table if not exists app_secret (
  key   text primary key,
  value text not null
);

create table if not exists auth_throttle (
  who        text primary key,
  failures   int not null default 0,
  last_fail  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['season','owner','golfer','golfer_alias','roster_slot','tournament','swap','result','app_secret','auth_throttle'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- helpers ----------

create or replace function _current_season() returns int
language sql stable security definer set search_path = public as $$
  select id from season where is_current limit 1
$$;

-- Throttle: after 5 failures, wait 5 minutes.
create or replace function _check_throttle(p_who text) returns void
language plpgsql security definer set search_path = public as $$
declare r auth_throttle;
begin
  select * into r from auth_throttle where who = p_who;
  if found and r.failures >= 5 and r.last_fail > now() - interval '5 minutes' then
    raise exception 'Too many wrong PINs. Try again in a few minutes.';
  end if;
end $$;

create or replace function _note_failure(p_who text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into auth_throttle(who, failures, last_fail) values (p_who, 1, now())
  on conflict (who) do update set
    failures = case when auth_throttle.last_fail < now() - interval '5 minutes' then 1 else auth_throttle.failures + 1 end,
    last_fail = now();
end $$;

create or replace function _auth_owner(p_name text, p_pin text) returns bigint
language plpgsql security definer set search_path = public as $$
declare o owner;
begin
  perform _check_throttle('owner:' || lower(p_name));
  select * into o from owner where season_id = _current_season() and lower(name) = lower(p_name);
  if not found or o.pin_hash <> crypt(p_pin, o.pin_hash) then
    -- Don't raise here: raising would roll back the failure count.
    perform _note_failure('owner:' || lower(p_name));
    return null;
  end if;
  delete from auth_throttle where who = 'owner:' || lower(p_name);
  return o.id;
end $$;

create or replace function _auth_admin(p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
declare h text;
begin
  perform _check_throttle('admin');
  select value into h from app_secret where key = 'admin_pin_hash';
  if h is null or h <> crypt(p_pin, h) then
    perform _note_failure('admin');
    return false;
  end if;
  delete from auth_throttle where who = 'admin';
  return true;
end $$;

-- ---------- public reads (no PIN) ----------
-- Everything needed to show standings. Scoring itself runs in the app (src/lib/scoring.ts),
-- so the math lives in one tested place.

create or replace function get_league() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select _current_season() as id)
  select jsonb_build_object(
    'season',      (select to_jsonb(x) from season x, s where x.id = s.id),
    'owners',      (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name), '[]') from owner o, s where o.season_id = s.id),
    'golfers',     (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'flight', g.flight) order by g.flight, g.name), '[]') from golfer g, s where g.season_id = s.id),
    'aliases',     (select coalesce(jsonb_object_agg(a.alias, a.golfer_name), '{}') from golfer_alias a, s where a.season_id = s.id),
    'rosters',     (select coalesce(jsonb_agg(jsonb_build_object('owner', o.name, 'flight', r.flight, 'starter', r.starter, 'alternate', r.alternate)), '[]')
                      from roster_slot r join owner o on o.id = r.owner_id, s where o.season_id = s.id),
    'tournaments', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from tournament t, s where t.season_id = s.id),
    -- Swaps are only shown once the tournament has locked, so nobody sees moves before tee time.
    'swaps',       (select coalesce(jsonb_agg(jsonb_build_object('owner', o.name, 'tournamentId', w.tournament_id, 'flight', w.flight, 'kind', w.kind)), '[]')
                      from swap w join owner o on o.id = w.owner_id join tournament t on t.season_id = w.season_id and t.id = w.tournament_id, s
                     where w.season_id = s.id and t.lock_at <= now()),
    'results',     (select coalesce(jsonb_agg(jsonb_build_object('tournamentId', r.tournament_id, 'golfer', r.golfer_name, 'position', r.position, 'earnings', r.earnings)), '[]')
                      from result r, s where r.season_id = s.id)
  )
$$;

-- ---------- owner functions ----------

create or replace function owner_login(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid bigint;
begin
  oid := _auth_owner(p_name, p_pin);
  if oid is null then return jsonb_build_object('error', 'Wrong name or PIN.'); end if;
  return jsonb_build_object('id', oid, 'name', (select name from owner where id = oid));
end $$;

-- The owner's own swaps, including ones for tournaments that haven't locked yet.
create or replace function get_my_swaps(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid bigint;
begin
  oid := _auth_owner(p_name, p_pin);
  if oid is null then return jsonb_build_object('error', 'Wrong name or PIN.'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('tournamentId', tournament_id, 'flight', flight, 'kind', kind, 'createdAt', created_at) order by tournament_id), '[]')
            from swap where owner_id = oid);
end $$;

-- Make or change a swap for the next tournament. p_kind null removes it.
create or replace function set_my_swap(p_name text, p_pin text, p_tournament int, p_flight text, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid bigint; sid int := _current_season(); t tournament;
begin
  oid := _auth_owner(p_name, p_pin);
  if oid is null then return jsonb_build_object('error', 'Wrong name or PIN.'); end if;
  select * into t from tournament where season_id = sid and id = p_tournament;
  if not found then raise exception 'Unknown tournament.'; end if;
  if now() >= t.lock_at then raise exception 'Swaps for % are locked (first tee time has passed).', t.name; end if;
  if p_kind is null then
    delete from swap where owner_id = oid and tournament_id = p_tournament and flight = p_flight;
  else
    insert into swap(owner_id, season_id, tournament_id, flight, kind)
    values (oid, sid, p_tournament, p_flight, p_kind)
    on conflict (owner_id, tournament_id, flight) do update set kind = excluded.kind, created_at = now();
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- commissioner functions ----------

create or replace function admin_check(p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
begin return _auth_admin(p_pin); end $$;

-- Swap on someone's behalf (e.g. they texted you). Ignores the lock so you can fix mistakes.
create or replace function admin_set_swap(p_pin text, p_owner text, p_tournament int, p_flight text, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid bigint; sid int := _current_season();
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  select id into oid from owner where season_id = sid and lower(name) = lower(p_owner);
  if oid is null then raise exception 'Unknown owner %', p_owner; end if;
  if p_kind is null then
    delete from swap where owner_id = oid and tournament_id = p_tournament and flight = p_flight;
  else
    insert into swap(owner_id, season_id, tournament_id, flight, kind, created_by)
    values (oid, sid, p_tournament, p_flight, p_kind, 'commissioner')
    on conflict (owner_id, tournament_id, flight) do update set kind = excluded.kind, created_at = now(), created_by = 'commissioner';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Replace all results for a tournament. p_rows: [{golfer, position, earnings}]
create or replace function admin_set_results(p_pin text, p_tournament int, p_rows jsonb, p_final boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid int := _current_season(); n int;
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  delete from result where season_id = sid and tournament_id = p_tournament;
  insert into result(season_id, tournament_id, golfer_name, position, earnings)
  select distinct on (r->>'golfer') sid, p_tournament, r->>'golfer', r->>'position', nullif(r->>'earnings','')::numeric
  from jsonb_array_elements(p_rows) r
  where coalesce(r->>'golfer','') <> '';
  get diagnostics n = row_count;
  update tournament set status = case when p_final then 'final' else 'in_progress' end
   where season_id = sid and id = p_tournament;
  return jsonb_build_object('ok', true, 'rows', n);
end $$;

create or replace function admin_set_alias(p_pin text, p_alias text, p_golfer text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  insert into golfer_alias(season_id, alias, golfer_name) values (_current_season(), p_alias, p_golfer)
  on conflict (season_id, alias) do update set golfer_name = excluded.golfer_name;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_upsert_owner(p_pin text, p_name text, p_new_pin text, p_email text default null, p_paid boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  insert into owner(season_id, name, email, pin_hash, paid)
  values (_current_season(), p_name, p_email, crypt(p_new_pin, gen_salt('bf')), p_paid)
  on conflict (season_id, name) do update set
    email = coalesce(excluded.email, owner.email),
    paid = excluded.paid,
    pin_hash = case when p_new_pin is null or p_new_pin = '' then owner.pin_hash else excluded.pin_hash end;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_set_roster_slot(p_pin text, p_owner text, p_flight text, p_starter text, p_alternate text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid bigint;
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  select id into oid from owner where season_id = _current_season() and lower(name) = lower(p_owner);
  if oid is null then raise exception 'Unknown owner %', p_owner; end if;
  insert into roster_slot(owner_id, flight, starter, alternate) values (oid, p_flight, p_starter, p_alternate)
  on conflict (owner_id, flight) do update set starter = excluded.starter, alternate = excluded.alternate;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_upsert_tournament(p_pin text, p_id int, p_name text, p_start date, p_lock_at timestamptz,
                                                   p_purse numeric default null, p_field_url text default null, p_espn_event_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  insert into tournament(season_id, id, name, start_date, lock_at, purse, field_url, espn_event_id)
  values (_current_season(), p_id, p_name, p_start, p_lock_at, p_purse, p_field_url, p_espn_event_id)
  on conflict (season_id, id) do update set name = excluded.name, start_date = excluded.start_date, lock_at = excluded.lock_at,
    purse = excluded.purse, field_url = excluded.field_url, espn_event_id = excluded.espn_event_id;
  return jsonb_build_object('ok', true);
end $$;

-- Let the browser call only the functions, never the tables.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function get_league() to anon;
grant execute on function owner_login(text, text) to anon;
grant execute on function get_my_swaps(text, text) to anon;
grant execute on function set_my_swap(text, text, int, text, text) to anon;
grant execute on function admin_check(text) to anon;
grant execute on function admin_set_swap(text, text, int, text, text) to anon;
grant execute on function admin_set_results(text, int, jsonb, boolean) to anon;
grant execute on function admin_set_alias(text, text, text) to anon;
grant execute on function admin_upsert_owner(text, text, text, text, boolean) to anon;
grant execute on function admin_set_roster_slot(text, text, text, text, text) to anon;
grant execute on function admin_upsert_tournament(text, int, text, date, timestamptz, numeric, text, text) to anon;

-- ---------- one-time setup (edit, then run separately) ----------
-- insert into season(id, name, is_current) values (2027, 'PGA Fantasy 2027', true);
-- insert into app_secret(key, value) values ('admin_pin_hash', crypt('CHOOSE-A-PIN', gen_salt('bf')));

-- ---------- season setup (added in the season-setup change; safe to re-run) ----------

-- Replace the whole golfer pool. p_rows: [{name, flight}]
create or replace function admin_set_golfers(p_pin text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare sid int := _current_season(); n int;
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  delete from golfer where season_id = sid;
  insert into golfer(season_id, name, flight)
  select distinct on (trim(r->>'name')) sid, trim(r->>'name'), upper(trim(r->>'flight'))
  from jsonb_array_elements(p_rows) r
  where coalesce(trim(r->>'name'), '') <> '';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'rows', n);
end $$;

-- Owners with their private details (email, paid), for the commissioner only.
create or replace function admin_get_owners(p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'email', email, 'paid', paid) order by name), '[]')
            from owner where season_id = _current_season());
end $$;

create or replace function admin_remove_owner(p_pin text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  delete from owner where season_id = _current_season() and lower(name) = lower(p_name);
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_remove_tournament(p_pin text, p_id int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare sid int := _current_season();
begin
  if not _auth_admin(p_pin) then return jsonb_build_object('error', 'Wrong commissioner PIN.'); end if;
  if exists (select 1 from result where season_id = sid and tournament_id = p_id)
     or exists (select 1 from swap where season_id = sid and tournament_id = p_id) then
    return jsonb_build_object('error', 'That tournament already has results or swaps, so it can''t be removed.');
  end if;
  delete from tournament where season_id = sid and id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function admin_set_golfers(text, jsonb), admin_get_owners(text), admin_remove_owner(text, text), admin_remove_tournament(text, int) from public;
grant execute on function admin_set_golfers(text, jsonb) to anon;
grant execute on function admin_get_owners(text) to anon;
grant execute on function admin_remove_owner(text, text) to anon;
grant execute on function admin_remove_tournament(text, int) to anon;
