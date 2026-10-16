-- D3 / PR 5: per-therapist cutover. BREAKING for the old guest bundle (direct POST /appointments).
-- Run only after: (1) therapists are seeded with hours, (2) every legacy booking has a staff_id
-- (data step, spec §6), (3) the bundle using request_appointment is live. Aborts otherwise, changing nothing.
--   a. one active booking per THERAPIST per slot (unique index swap)
--   b. _slot_problem: slot is taken only by the same therapist's booking
--   c. guests can no longer insert directly (policy dropped, column grant revoked) -> RPC only
--   d. therapists see/decide only their own bookings; admin + front_desk the whole clinic
-- Rollback: supabase/rollback/rollback_0800.sql

-- ---------- pre-checks (abort with a clear message, nothing changed) ----------
do $$
declare v_null bigint; v_ids text; v_ther bigint;
begin
  if to_regprocedure('public._slot_problem(uuid,uuid,date,text)') is null then
    raise exception 'D3 0800: migration 20261016000700 is not applied. Nothing was changed.';
  end if;
  select count(*) into v_ther from public.staff where active and role = 'therapist';
  select count(*), string_agg(id::text, ', ' order by slot_date, slot_time)
    into v_null, v_ids
    from public.appointments where staff_id is null and status <> 'declined';
  if v_null > 0 then
    raise exception 'D3 0800: % active booking(s) have no therapist (staff_id is null): %', v_null, v_ids
      using hint = 'Seed the therapists and run the data step first (assign legacy bookings to the first therapist, spec §6). Active therapists right now: ' || v_ther || '. Nothing was changed.';
  end if;
  select string_agg(ids, ' | ') into v_ids from (
    select string_agg(id::text, ',') as ids from public.appointments
    where status <> 'declined'
    group by clinic_id, staff_id, slot_date, slot_time having count(*) > 1) d;
  if v_ids is not null then
    raise exception 'D3 0800: duplicate active bookings for one therapist and slot: %', v_ids
      using hint = 'Decline or move one of each group, then re-run. Nothing was changed.';
  end if;
end $$;

-- ---------- a. unique index: per therapist ----------
-- Declined/NULL-staff legacy rows are allowed (the pre-check covers active ones; NULLs never collide).
-- Plain create (not concurrently) so the whole file can run in one transaction; the table is small.
drop index if exists public.appointments_active_slot_staff;
create unique index appointments_active_slot_staff
  on public.appointments (clinic_id, staff_id, slot_date, slot_time) where status <> 'declined';
drop index if exists public.appointments_active_slot;
alter index public.appointments_active_slot_staff rename to appointments_active_slot;

-- ---------- b. taken = same therapist only ----------
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
  -- Per therapist (0800): another therapist's booking never blocks this one.
  if exists (select 1 from public.appointments a
             where a.clinic_id = p_clinic_id and a.staff_id = p_staff_id
               and a.slot_date = p_slot_date and a.slot_time = p_slot_time
               and a.status <> 'declined') then
    return 'slot_taken';
  end if;
  return null;
end $$;
revoke execute on function public._slot_problem(uuid, uuid, date, text) from public, anon, authenticated;

-- ---------- c. no direct guest inserts ----------
drop policy if exists "Guests request pending appointments" on public.appointments;
revoke insert on table public.appointments from anon;

-- ---------- d. staff visibility by role ----------
drop policy if exists "Staff read their clinic's appointments"   on public.appointments;
drop policy if exists "Staff decide their clinic's appointments" on public.appointments;
create policy "Staff read their clinic's appointments"
  on public.appointments for select to authenticated
  using (public.has_role(clinic_id, array['admin','front_desk'])
         or (public.has_role(clinic_id, array['therapist']) and staff_id = (select auth.uid())));
create policy "Staff decide their clinic's appointments"
  on public.appointments for update to authenticated
  using (public.has_role(clinic_id, array['admin','front_desk'])
         or (public.has_role(clinic_id, array['therapist']) and staff_id = (select auth.uid())))
  with check (public.has_role(clinic_id, array['admin','front_desk'])
         or (public.has_role(clinic_id, array['therapist']) and staff_id = (select auth.uid())));
