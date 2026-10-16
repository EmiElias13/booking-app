-- D3 / PR 1: per-therapist calendars, additive part. Safe on the live project: the current app keeps
-- working (anon insert path, 3-arg get_taken_slots and the clinic-wide unique index are untouched
-- until 20261016000800). Spec: docs/specs/d3-therapist-calendars.md

-- ---------- staff: name, active, order ----------
alter table public.staff
  add column if not exists display_name text not null default '' check (length(display_name) <= 80),
  add column if not exists active boolean not null default true,
  add column if not exists sort_order smallint not null default 0;
grant update (role, display_name, active, sort_order) on table public.staff to authenticated;  -- "Admin edits staff" policy limits it to admins

-- ---------- one session length per clinic ----------
alter table public.clinics
  add column if not exists slot_minutes int not null default 60 check (slot_minutes between 10 and 240);

-- ---------- weekly hours (several ranges per weekday allowed) ----------
create table if not exists public.staff_hours (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  staff_id   uuid not null,
  weekday    smallint not null check (weekday between 0 and 6),   -- 0 = Sunday, as extract(dow)
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time),
  foreign key (staff_id, clinic_id) references public.staff (user_id, clinic_id) on delete cascade
);
create index if not exists staff_hours_lookup_idx on public.staff_hours (clinic_id, staff_id, weekday);

-- ---------- time off: whole days, inclusive ----------
create table if not exists public.staff_time_off (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  staff_id   uuid not null,
  start_date date not null,
  end_date   date not null,
  reason     text not null default '' check (length(reason) <= 200),   -- staff-only, never public
  check (end_date >= start_date),
  foreign key (staff_id, clinic_id) references public.staff (user_id, clinic_id) on delete cascade
);
create index if not exists staff_time_off_lookup_idx on public.staff_time_off (clinic_id, staff_id, start_date);

revoke all on table public.staff_hours, public.staff_time_off from anon, authenticated;
grant select, insert, update, delete on table public.staff_hours, public.staff_time_off to authenticated;
alter table public.staff_hours    enable row level security;
alter table public.staff_time_off enable row level security;

drop policy if exists "Staff read hours"   on public.staff_hours;
drop policy if exists "Admin writes hours" on public.staff_hours;
create policy "Staff read hours" on public.staff_hours for select to authenticated
  using (public.is_staff_of(clinic_id));
create policy "Admin writes hours" on public.staff_hours for all to authenticated
  using (public.has_role(clinic_id, array['admin'])) with check (public.has_role(clinic_id, array['admin']));

drop policy if exists "Staff read time off"   on public.staff_time_off;
drop policy if exists "Admin writes time off" on public.staff_time_off;
create policy "Staff read time off" on public.staff_time_off for select to authenticated
  using (public.is_staff_of(clinic_id));
create policy "Admin writes time off" on public.staff_time_off for all to authenticated
  using (public.has_role(clinic_id, array['admin'])) with check (public.has_role(clinic_id, array['admin']));

-- ---------- shared slot rule (internal) ----------
-- Returns NULL when the slot is bookable for that therapist, otherwise an error code.
-- Does NOT check whether the slot is already taken (the unique index / callers do).
create or replace function public._slot_problem(p_clinic_id uuid, p_staff_id uuid, p_slot_date date, p_slot_time text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := public.clinic_today(p_clinic_id);
  v_now   timestamp := public.clinic_now(p_clinic_id);
  v_len   int;
  v_t     time;
begin
  if v_today is null then return 'unknown_clinic'; end if;
  if not exists (select 1 from public.staff s
                 where s.user_id = p_staff_id and s.clinic_id = p_clinic_id
                   and s.active and s.role = 'therapist') then
    return 'inactive_staff';
  end if;
  if p_slot_time is null or p_slot_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return 'bad_time'; end if;
  v_t := p_slot_time::time;
  if p_slot_date is null or p_slot_date < v_today
     or (p_slot_date = v_today and v_t <= v_now::time) then
    return 'past_slot';
  end if;
  if p_slot_date > v_today + 92 then return 'too_far'; end if;
  select c.slot_minutes into v_len from public.clinics c where c.id = p_clinic_id;
  if not exists (
    select 1 from public.staff_hours h
    where h.clinic_id = p_clinic_id and h.staff_id = p_staff_id
      and h.weekday = extract(dow from p_slot_date)
      and v_t >= h.start_time
      and v_t + make_interval(mins => v_len) <= h.end_time
      and v_t + make_interval(mins => v_len) > v_t               -- no wrap past midnight
      and (extract(epoch from (v_t - h.start_time))::int % (v_len * 60)) = 0
  ) then
    return 'outside_hours';
  end if;
  if exists (select 1 from public.staff_time_off o
             where o.clinic_id = p_clinic_id and o.staff_id = p_staff_id
               and p_slot_date between o.start_date and o.end_date) then
    return 'time_off';
  end if;
  return null;
end $$;
revoke execute on function public._slot_problem(uuid, uuid, date, text) from public, anon, authenticated;

-- ---------- guest booking ----------
create or replace function public.request_appointment(
  p_clinic_id uuid, p_staff_id uuid, p_slot_date date, p_slot_time text,
  p_client_name text, p_email text, p_phone text default '', p_service text default '', p_notes text default '')
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_problem text; v_id uuid;
begin
  v_problem := public._slot_problem(p_clinic_id, p_staff_id, p_slot_date, p_slot_time);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'P0001';
  end if;
  begin
    insert into public.appointments (clinic_id, staff_id, slot_date, slot_time, client_name, email, phone, service, notes, status, staff_note)
    values (p_clinic_id, p_staff_id, p_slot_date, p_slot_time,
            coalesce(p_client_name, ''), coalesce(p_email, ''), coalesce(p_phone, ''), coalesce(p_service, ''), coalesce(p_notes, ''),
            'pending', '')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'slot_taken' using errcode = 'P0001';
  end;
  return v_id;
end $$;
revoke execute on function public.request_appointment(uuid, uuid, date, text, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.request_appointment(uuid, uuid, date, text, text, text, text, text, text) to anon, authenticated;

-- ---------- public therapist list: id + name only ----------
create or replace function public.list_therapists(p_clinic_id uuid)
returns table (id uuid, display_name text)
language sql stable security definer set search_path = ''
as $$
  select s.user_id, s.display_name
  from public.staff s
  where s.clinic_id = p_clinic_id and s.active and s.role = 'therapist'
  order by s.sort_order, s.display_name, s.user_id;
$$;
revoke execute on function public.list_therapists(uuid) from public, anon, authenticated;
grant  execute on function public.list_therapists(uuid) to anon, authenticated;

-- ---------- taken slots for one therapist ----------
create or replace function public.get_taken_slots(p_clinic_id uuid, p_from date, p_to date, p_staff_id uuid)
returns table (slot_date date, slot_time text)
language sql stable security definer set search_path = ''
as $$
  select a.slot_date, a.slot_time
  from public.appointments a
  where a.clinic_id = p_clinic_id
    and a.staff_id = p_staff_id
    and a.status <> 'declined'
    and a.slot_date >= greatest(p_from, public.clinic_today(p_clinic_id))
    and a.slot_date <= p_to
    and p_to - p_from <= 92
  order by a.slot_date, a.slot_time;
$$;
revoke execute on function public.get_taken_slots(uuid, date, date, uuid) from public, anon, authenticated;
grant  execute on function public.get_taken_slots(uuid, date, date, uuid) to anon, authenticated;

-- ---------- free slots for one therapist, generated from their hours ----------
create or replace function public.get_available_slots(p_clinic_id uuid, p_staff_id uuid, p_from date, p_to date)
returns table (slot_date date, slot_time text)
language sql stable security definer set search_path = ''
as $$
  with c as (
    select cl.slot_minutes, public.clinic_today(cl.id) as today
    from public.clinics cl where cl.id = p_clinic_id
  ), days as (
    select d::date as day
    from c, generate_series(greatest(p_from, c.today), least(p_to, c.today + 92), interval '1 day') d
    where p_to - p_from <= 92
  ), cand as (
    select days.day, to_char(t, 'HH24:MI') as hhmm
    from days
    join public.staff_hours h
      on h.clinic_id = p_clinic_id and h.staff_id = p_staff_id and h.weekday = extract(dow from days.day)
    cross join c
    cross join lateral generate_series(
      '2000-01-01'::date + h.start_time,
      '2000-01-01'::date + h.end_time - make_interval(mins => c.slot_minutes),
      make_interval(mins => c.slot_minutes)) t
  )
  select distinct cand.day, cand.hhmm
  from cand
  where public._slot_problem(p_clinic_id, p_staff_id, cand.day, cand.hhmm) is null
    and not exists (select 1 from public.appointments a
                    where a.clinic_id = p_clinic_id and a.slot_date = cand.day and a.slot_time = cand.hhmm
                      and a.staff_id = p_staff_id and a.status <> 'declined')
  order by 1, 2;
$$;
revoke execute on function public.get_available_slots(uuid, uuid, date, date) from public, anon, authenticated;
grant  execute on function public.get_available_slots(uuid, uuid, date, date) to anon, authenticated;
