-- Rollback for 20261016000800_d3_cutover.sql (spec §6). One transaction; run in the SQL editor, then
-- redeploy the previous bundle if needed. Fails (changing nothing) if two therapists now share a slot:
-- then keep the per-therapist index and restore only the policies (delete the index block below).
begin;
-- clinic-wide unique index back
create unique index appointments_active_slot_clinic
  on public.appointments (clinic_id, slot_date, slot_time) where status <> 'declined';
drop index if exists public.appointments_active_slot;
alter index public.appointments_active_slot_clinic rename to appointments_active_slot;

-- _slot_problem: clinic-wide "taken" again (exact body from 0700)
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
  -- TRANSITIONAL (0700): clinic-wide. 0800 changes this to `and a.staff_id = p_staff_id`.
  if exists (select 1 from public.appointments a
             where a.clinic_id = p_clinic_id and a.slot_date = p_slot_date and a.slot_time = p_slot_time
               and a.status <> 'declined') then
    return 'slot_taken';
  end if;
  return null;
end $$;
revoke execute on function public._slot_problem(uuid, uuid, date, text) from public, anon, authenticated;

-- anon direct insert (0300 column grant + 0600 policy)
grant insert (id, clinic_id, client_name, email, phone, service, notes, slot_date, slot_time) on table public.appointments to anon;
drop policy if exists "Guests request pending appointments" on public.appointments;
create policy "Guests request pending appointments" on public.appointments for insert to anon
  with check (status = 'pending' and staff_note = '' and staff_id is null
    and (slot_date > public.clinic_today(clinic_id)
         or (slot_date = public.clinic_today(clinic_id) and slot_time::time > public.clinic_now(clinic_id)::time)));

-- every staff role sees/decides the whole clinic again (0300)
drop policy if exists "Staff read their clinic's appointments"   on public.appointments;
drop policy if exists "Staff decide their clinic's appointments" on public.appointments;
create policy "Staff read their clinic's appointments" on public.appointments for select to authenticated
  using (public.is_staff_of(clinic_id));
create policy "Staff decide their clinic's appointments" on public.appointments for update to authenticated
  using (public.is_staff_of(clinic_id)) with check (public.is_staff_of(clinic_id));
commit;
