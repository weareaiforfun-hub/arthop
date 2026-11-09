-- ArtHop (lives in the shared to-one project, so its tables and functions carry the ah_ prefix).
-- Built from MuseumHop's schema (na_ tables), renamed. A "night" here is one friend group's Art Week (18–22 Nov 2026):
-- its routes hold stops for all five days, and each stop carries its day.
-- One "night" per friend group. Everyone signs in anonymously today; because membership is keyed on auth.uid(),
-- upgrading an anonymous user to a real account later keeps all their data. Nights are reachable only through an
-- invite token (stored hashed), and every table is scoped by night_id, so strangers' groups never see each other.
-- Every table has an opaque uuid primary key: Realtime DELETE events carry only the primary key and can't be
-- filtered, so this keeps them free of anything meaningful.

create table public.ah_nights (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Art Week 2026' check (char_length(name) between 1 and 80),
  event_date date not null default '2026-11-22',
  vote_deadline timestamptz,
  route_locked_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.ah_members (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  display_name text not null check (char_length(display_name) between 1 and 32),
  color text not null default '#2f6db5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  role text not null default 'planner' check (role in ('organiser', 'planner', 'viewer')),
  fictional boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (night_id, user_id)
);

create table public.ah_invites (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  token_hash text not null unique,
  role text not null default 'planner' check (role in ('planner', 'viewer')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.ah_crews (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#2f6db5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.ah_crew_members (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  crew_id uuid not null references public.ah_crews(id) on delete cascade,
  user_id uuid not null,
  unique (night_id, user_id) -- one crew per person per night
);

-- Shared route (one per night), personal routes (one per person; these are the "route ideas") and crew routes.
create table public.ah_routes (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  kind text not null check (kind in ('shared', 'personal', 'crew')),
  owner_user uuid,
  crew_id uuid references public.ah_crews(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 100),
  description text not null default '' check (char_length(description) <= 1500),
  practical text not null default '' check (char_length(practical) <= 2000),
  updated_at timestamptz not null default now(),
  check ((kind = 'personal') = (owner_user is not null)),
  check ((kind = 'crew') = (crew_id is not null))
);
create unique index ah_routes_shared on public.ah_routes (night_id) where kind = 'shared';
create unique index ah_routes_personal on public.ah_routes (night_id, owner_user) where kind = 'personal';
create unique index ah_routes_crew on public.ah_routes (crew_id) where kind = 'crew';

-- One row per stop, ordered by a fractional position: a move rewrites only `pos`, a time change only
-- `arrival`/`duration`, so concurrent edits by different people both survive.
create table public.ah_stops (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  route_id uuid not null references public.ah_routes(id) on delete cascade,
  pos double precision not null,
  day date not null default '2026-11-19' check (day between '2026-11-18' and '2026-11-22'), -- Art Week day of this stop
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  arrival text not null default '' check (arrival = '' or arrival ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  duration int not null default 45 check (duration between 10 and 240),
  reason text not null default '' check (char_length(reason) <= 500),
  practical text not null default '' check (char_length(practical) <= 600),
  transfer text not null default '' check (char_length(transfer) <= 400),
  fixed boolean not null default false,
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (route_id, day, event_id) -- the same exhibition can be on Thursday and again on Saturday
);
create index ah_stops_route on public.ah_stops (route_id, day, pos);

create table public.ah_reactions (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  reaction text not null check (reaction in ('must', 'up', 'skip')),
  note text not null default '' check (char_length(note) <= 240),
  updated_at timestamptz not null default now(),
  unique (night_id, user_id, event_id)
);

create table public.ah_idea_votes (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  route_id uuid not null references public.ah_routes(id) on delete cascade,
  unique (night_id, user_id)
);

create table public.ah_meetups (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  day date not null default '2026-11-19' check (day between '2026-11-18' and '2026-11-22'),
  at text not null check (at ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  note text not null default '' check (char_length(note) <= 240),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.ah_meetup_crews (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  meetup_id uuid not null references public.ah_meetups(id) on delete cascade,
  crew_id uuid not null references public.ah_crews(id) on delete cascade,
  confirmed_at timestamptz,
  arrived_at timestamptz,
  unique (meetup_id, crew_id)
);

-- Who changed what, written only by triggers. Feeds the activity list.
create table public.ah_activity (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.ah_nights(id) on delete cascade,
  user_id uuid,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index ah_activity_night on public.ah_activity (night_id, created_at desc);

/* ---------- access helpers ---------- */

-- The caller's role in a night, or null. Security definer avoids RLS recursion on ah_members.
create function public.ah_role(n uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from ah_members where night_id = n and user_id = auth.uid();
$$;

create function public.ah_can_write(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.ah_role(n) in ('organiser', 'planner'), false);
$$;

-- Who may change a route and its stops.
create function public.ah_can_edit_route(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case ro.kind
    when 'shared' then public.ah_can_write(ro.night_id)
      and (nt.route_locked_at is null or nt.route_locked_at > now() or public.ah_role(ro.night_id) = 'organiser')
    when 'personal' then ro.owner_user = auth.uid() and public.ah_role(ro.night_id) is not null
    when 'crew' then public.ah_can_write(ro.night_id)
      and exists (select 1 from ah_crew_members cm where cm.crew_id = ro.crew_id and cm.user_id = auth.uid())
  end
  from ah_routes ro join ah_nights nt on nt.id = ro.night_id where ro.id = r;
$$;

/* ---------- row level security ---------- */

alter table public.ah_nights enable row level security;
alter table public.ah_members enable row level security;
alter table public.ah_invites enable row level security;
alter table public.ah_crews enable row level security;
alter table public.ah_crew_members enable row level security;
alter table public.ah_routes enable row level security;
alter table public.ah_stops enable row level security;
alter table public.ah_reactions enable row level security;
alter table public.ah_idea_votes enable row level security;
alter table public.ah_meetups enable row level security;
alter table public.ah_meetup_crews enable row level security;
alter table public.ah_activity enable row level security;

create policy "members read night" on public.ah_nights for select using (public.ah_role(id) is not null);
create policy "organiser edits night" on public.ah_nights for update
  using (public.ah_role(id) = 'organiser') with check (public.ah_role(id) = 'organiser');

create policy "members read members" on public.ah_members for select using (public.ah_role(night_id) is not null);
create policy "edit own member row" on public.ah_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Invites are read through the organiser's own view only; joining goes through ah_join_night.
create policy "organiser reads invites" on public.ah_invites for select using (public.ah_role(night_id) = 'organiser');

create policy "members read crews" on public.ah_crews for select using (public.ah_role(night_id) is not null);
create policy "planners add crews" on public.ah_crews for insert with check (public.ah_can_write(night_id));
create policy "planners edit crews" on public.ah_crews for update
  using (public.ah_can_write(night_id)) with check (public.ah_can_write(night_id));
create policy "planners remove crews" on public.ah_crews for delete using (public.ah_can_write(night_id));

create policy "members read crew members" on public.ah_crew_members for select using (public.ah_role(night_id) is not null);
create policy "planners add crew members" on public.ah_crew_members for insert with check (
  public.ah_can_write(night_id)
  and exists (select 1 from ah_crews c where c.id = crew_id and c.night_id = ah_crew_members.night_id)
  and exists (select 1 from ah_members m where m.night_id = ah_crew_members.night_id and m.user_id = ah_crew_members.user_id));
create policy "planners remove crew members" on public.ah_crew_members for delete using (public.ah_can_write(night_id));

create policy "members read routes" on public.ah_routes for select using (public.ah_role(night_id) is not null);
create policy "add own personal or crew route" on public.ah_routes for insert with check (
  (kind = 'personal' and owner_user = auth.uid() and public.ah_role(night_id) is not null)
  or (kind = 'crew' and public.ah_can_write(night_id)
      and exists (select 1 from ah_crews c where c.id = crew_id and c.night_id = ah_routes.night_id)));
create policy "editors update routes" on public.ah_routes for update
  using (public.ah_can_edit_route(id)) with check (public.ah_can_edit_route(id));
create policy "owners remove personal routes" on public.ah_routes for delete using (kind = 'personal' and owner_user = auth.uid());

create policy "members read stops" on public.ah_stops for select using (public.ah_role(night_id) is not null);
create policy "editors add stops" on public.ah_stops for insert with check (
  public.ah_can_edit_route(route_id) and exists (select 1 from ah_routes r where r.id = route_id and r.night_id = ah_stops.night_id));
create policy "editors update stops" on public.ah_stops for update
  using (public.ah_can_edit_route(route_id)) with check (public.ah_can_edit_route(route_id));
create policy "editors remove stops" on public.ah_stops for delete using (public.ah_can_edit_route(route_id));

create policy "members read reactions" on public.ah_reactions for select using (public.ah_role(night_id) is not null);
create policy "add own reaction" on public.ah_reactions for insert
  with check (user_id = auth.uid() and public.ah_can_write(night_id));
create policy "edit own reaction" on public.ah_reactions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.ah_can_write(night_id));
create policy "remove own reaction" on public.ah_reactions for delete using (user_id = auth.uid());

create policy "members read idea votes" on public.ah_idea_votes for select using (public.ah_role(night_id) is not null);
create policy "cast own idea vote" on public.ah_idea_votes for insert with check (
  user_id = auth.uid() and public.ah_can_write(night_id)
  and exists (select 1 from ah_routes r where r.id = route_id and r.night_id = ah_idea_votes.night_id and r.kind = 'personal'));
create policy "change own idea vote" on public.ah_idea_votes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid()
    and exists (select 1 from ah_routes r where r.id = route_id and r.night_id = ah_idea_votes.night_id and r.kind = 'personal'));
create policy "remove own idea vote" on public.ah_idea_votes for delete using (user_id = auth.uid());

create policy "members read meetups" on public.ah_meetups for select using (public.ah_role(night_id) is not null);
create policy "planners add meetups" on public.ah_meetups for insert with check (public.ah_can_write(night_id) and created_by = auth.uid());
create policy "planners edit meetups" on public.ah_meetups for update
  using (public.ah_can_write(night_id)) with check (public.ah_can_write(night_id));
create policy "planners remove meetups" on public.ah_meetups for delete using (public.ah_can_write(night_id));

-- A crew's confirmation / arrival can only be set by a member of that crew.
create policy "members read meetup crews" on public.ah_meetup_crews for select using (public.ah_role(night_id) is not null);
create policy "crew members confirm" on public.ah_meetup_crews for insert with check (
  public.ah_can_write(night_id)
  and exists (select 1 from ah_crew_members cm where cm.crew_id = ah_meetup_crews.crew_id and cm.user_id = auth.uid())
  and exists (select 1 from ah_meetups mt where mt.id = meetup_id and mt.night_id = ah_meetup_crews.night_id));
create policy "crew members update confirmation" on public.ah_meetup_crews for update
  using (exists (select 1 from ah_crew_members cm where cm.crew_id = ah_meetup_crews.crew_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from ah_crew_members cm where cm.crew_id = ah_meetup_crews.crew_id and cm.user_id = auth.uid()));
create policy "crew members withdraw" on public.ah_meetup_crews for delete
  using (exists (select 1 from ah_crew_members cm where cm.crew_id = ah_meetup_crews.crew_id and cm.user_id = auth.uid()));

create policy "members read activity" on public.ah_activity for select using (public.ah_role(night_id) is not null);

/* ---------- guards and activity triggers ---------- */

create function public.ah_touch_stop() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and (select count(*) from ah_stops where route_id = new.route_id and day = new.day) >= 40 then
    raise exception 'A day can have at most 40 stops.';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger ah_stops_touch before insert or update on public.ah_stops for each row execute function public.ah_touch_stop();

create function public.ah_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_kind text; v_data jsonb := '{}';
begin
  if current_setting('ah.quiet', true) = 'on' then return null; end if;
  r := case when tg_op = 'DELETE' then old else new end;
  -- Rows removed because their whole night is being deleted.
  if not exists (select 1 from ah_nights where id = r.night_id) then return null; end if;
  if tg_table_name = 'ah_stops' then
    if tg_op = 'UPDATE' and old.pos is not distinct from new.pos and old.arrival is not distinct from new.arrival
       and old.duration is not distinct from new.duration then return null; end if;
    v_kind := case tg_op when 'INSERT' then 'stop_add' when 'DELETE' then 'stop_remove'
              else case when old.pos is distinct from new.pos then 'stop_move' else 'stop_time' end end;
    v_data := jsonb_build_object('event_id', r.event_id, 'route_id', r.route_id, 'day', r.day,
      'route_kind', (select kind from ah_routes where id = r.route_id), 'arrival', r.arrival, 'duration', r.duration,
      'changed', case when tg_op = 'UPDATE' and old.arrival is not distinct from new.arrival then 'duration' else 'arrival' end);
  elsif tg_table_name = 'ah_reactions' then
    if tg_op = 'UPDATE' and old.reaction = new.reaction then return null; end if;
    v_kind := case when tg_op = 'DELETE' then 'reaction_clear' else 'reaction' end;
    v_data := jsonb_build_object('event_id', r.event_id, 'reaction', r.reaction);
  elsif tg_table_name = 'ah_members' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'member_join'; v_data := jsonb_build_object('name', r.display_name);
  elsif tg_table_name = 'ah_crews' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'crew_add'; v_data := jsonb_build_object('name', r.name);
  elsif tg_table_name = 'ah_meetups' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'meetup_add'; v_data := jsonb_build_object('event_id', r.event_id, 'at', r.at, 'day', r.day);
  end if;
  insert into ah_activity (night_id, user_id, kind, data) values (r.night_id, auth.uid(), v_kind, v_data);
  return null;
end $$;
create trigger ah_stops_log after insert or update or delete on public.ah_stops for each row execute function public.ah_log();
create trigger ah_reactions_log after insert or update or delete on public.ah_reactions for each row execute function public.ah_log();
create trigger ah_members_log after insert on public.ah_members for each row execute function public.ah_log();
create trigger ah_crews_log after insert on public.ah_crews for each row execute function public.ah_log();
create trigger ah_meetups_log after insert on public.ah_meetups for each row execute function public.ah_log();

/* ---------- RPCs ---------- */

-- Create a night with its shared route and a planner invite; the caller becomes organiser. Returns the invite token.
create function public.ah_create_night(p_name text, p_display_name text, p_color text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_night uuid; v_token text := encode(gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into ah_nights (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'Art Week 2026'), auth.uid())
    returning id into v_night;
  insert into ah_members (night_id, user_id, display_name, color, role)
    values (v_night, auth.uid(), trim(p_display_name), p_color, 'organiser');
  insert into ah_routes (night_id, kind, title) values (v_night, 'shared', 'Our route');
  insert into ah_invites (night_id, token_hash, role) values (v_night, encode(digest(v_token, 'sha256'), 'hex'), 'planner');
  return v_token;
end $$;

-- Join (or rename yourself in) the night an invite token points to. Returns the night id.
create function public.ah_join_night(p_token text, p_display_name text, p_color text, p_fictional boolean default false)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_invite ah_invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_invite from ah_invites
    where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and revoked_at is null;
  if v_invite.id is null then raise exception 'invite not found'; end if;
  if not exists (select 1 from ah_members where night_id = v_invite.night_id and user_id = auth.uid())
     and (select count(*) from ah_members where night_id = v_invite.night_id) >= 100 then
    raise exception 'This group is full.';
  end if;
  insert into ah_members (night_id, user_id, display_name, color, role, fictional)
    values (v_invite.night_id, auth.uid(), trim(p_display_name), p_color, v_invite.role, p_fictional)
    on conflict (night_id, user_id) do update set display_name = excluded.display_name, color = excluded.color;
  return v_invite.night_id;
end $$;

-- Replace the shared route's stops for one day (or, without p_day, for every day) with a copy of a personal route
-- (a "route idea"), as one transaction and one activity entry. Returns the number of stops.
create function public.ah_adopt_route(p_route uuid, p_day date default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_src ah_routes; v_shared uuid; v_n int;
begin
  select * into v_src from ah_routes where id = p_route and kind = 'personal';
  if v_src.id is null then raise exception 'route idea not found'; end if;
  select id into v_shared from ah_routes where night_id = v_src.night_id and kind = 'shared';
  if not public.ah_can_edit_route(v_shared) then raise exception 'not allowed to change the shared route'; end if;
  select count(*) into v_n from ah_stops where route_id = p_route and (p_day is null or day = p_day);
  if v_n = 0 then raise exception 'Add at least one stop before using this route.'; end if;
  perform set_config('ah.quiet', 'on', true);
  delete from ah_stops where route_id = v_shared and (p_day is null or day = p_day);
  insert into ah_stops (night_id, route_id, pos, day, event_id, arrival, duration, reason, practical, transfer, fixed, maybe, travel)
    select night_id, v_shared, pos, day, event_id, arrival, duration, reason, practical, transfer, fixed, maybe, travel
    from ah_stops where route_id = p_route and (p_day is null or day = p_day);
  perform set_config('ah.quiet', 'off', true);
  insert into ah_activity (night_id, user_id, kind, data)
    values (v_src.night_id, auth.uid(), 'route_adopt', jsonb_build_object('route_id', p_route, 'title', v_src.title, 'day', p_day));
  return v_n;
end $$;

revoke execute on function public.ah_create_night(text, text, text) from public, anon;
revoke execute on function public.ah_join_night(text, text, text, boolean) from public, anon;
revoke execute on function public.ah_adopt_route(uuid, date) from public, anon;
grant execute on function public.ah_create_night(text, text, text) to authenticated;
grant execute on function public.ah_join_night(text, text, text, boolean) to authenticated;
grant execute on function public.ah_adopt_route(uuid, date) to authenticated;

alter publication supabase_realtime add table
  public.ah_nights, public.ah_members, public.ah_crews, public.ah_crew_members, public.ah_routes, public.ah_stops,
  public.ah_reactions, public.ah_idea_votes, public.ah_meetups, public.ah_meetup_crews, public.ah_activity;

-- Row policies decide WHICH rows someone may update; these grants decide WHICH columns. Without them a member could
-- promote their own role, or move a stop or route into another night.
revoke update on public.ah_nights, public.ah_members, public.ah_routes, public.ah_stops, public.ah_reactions,
  public.ah_idea_votes, public.ah_crews, public.ah_meetups, public.ah_meetup_crews from anon, authenticated;
grant update (name, vote_deadline, route_locked_at) on public.ah_nights to authenticated;
grant update (display_name, color) on public.ah_members to authenticated;
grant update (title, description, practical, updated_at) on public.ah_routes to authenticated;
grant update (pos, arrival, duration, reason, practical, transfer, fixed) on public.ah_stops to authenticated;
grant update (reaction, note, updated_at) on public.ah_reactions to authenticated;
grant update (route_id) on public.ah_idea_votes to authenticated;
grant update (name, color) on public.ah_crews to authenticated;
grant update (day, at, event_id, note) on public.ah_meetups to authenticated;
grant update (confirmed_at, arrived_at) on public.ah_meetup_crews to authenticated;
