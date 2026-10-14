-- Guests cannot book a time that has already started today, in the clinic's own timezone.
-- Depends on / supersedes the policy from 20261009000500 (PR #19): staff_id is null is kept,
-- so this file is also correct if it runs without 0500.

-- Clinic's current local time. Anon can't read clinics, so this is security definer.
create or replace function public.clinic_now(p_clinic_id uuid)
returns timestamp
language sql stable security definer set search_path = ''
as $$
  select now() at time zone c.timezone from public.clinics c where c.id = p_clinic_id
$$;
revoke execute on function public.clinic_now(uuid) from public, anon, authenticated;
grant  execute on function public.clinic_now(uuid) to anon, authenticated;

drop policy if exists "Guests request pending appointments" on public.appointments;
create policy "Guests request pending appointments" on public.appointments for insert to anon
  with check (
    status = 'pending' and staff_note = '' and staff_id is null
    and (
      slot_date > public.clinic_today(clinic_id)
      or (slot_date = public.clinic_today(clinic_id)
          and slot_time::time > public.clinic_now(clinic_id)::time)
    )                                                   -- NULL for unknown clinic => rejected
  );
