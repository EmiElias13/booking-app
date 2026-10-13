-- PR 2 / 3 of 3: enforce tenancy, rename physio -> staff, replace the slot view with an RPC.
-- BREAKING for the current develop/main app (renamed column, dropped view, new insert grants).
-- Do not apply to the live project until the cutover described in the spec.

do $$
begin
  if exists (select 1 from public.appointments where clinic_id is null) then
    raise exception 'appointments.clinic_id has NULL rows: run the clinic backfill before this migration';
  end if;
end $$;

alter table public.appointments alter column clinic_id set not null;

-- Rename physio -> staff.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'appointments' and column_name = 'physio_note') then
    alter table public.appointments rename column physio_note to staff_note;
  end if;
end $$;

-- Guard rails for anonymous inserts (NOT VALID: enforced for new rows, existing rows untouched).
alter table public.appointments
  add constraint appointments_slot_time_format check (slot_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') not valid,
  add constraint appointments_field_lengths check (
    length(client_name) between 1 and 120
    and length(email) between 3 and 254
    and length(phone) <= 40
    and length(service) between 1 and 64
    and length(notes) <= 2000
    and length(staff_note) <= 2000
  ) not valid;

-- One active booking per clinic, date and time.
drop index if exists public.appointments_active_slot;
create unique index appointments_active_slot
  on public.appointments (clinic_id, slot_date, slot_time)
  where status <> 'declined';

-- The old view exposed every appointment's id + status to anon, across all clinics.
drop view if exists public.appointment_slots;

-- Privileges: anon may only insert the patient-supplied columns; staff may only change the decision.
revoke all on table public.appointments from anon, authenticated;
grant insert (id, clinic_id, client_name, email, phone, service, notes, slot_date, slot_time)
  on table public.appointments to anon;
grant select on table public.appointments to authenticated;
grant update (status, staff_note) on table public.appointments to authenticated;

alter table public.appointments enable row level security;

drop policy if exists "Guests can request pending appointments" on public.appointments;
drop policy if exists "Physio can read appointments"            on public.appointments;
drop policy if exists "Physio can update appointments"          on public.appointments;
drop policy if exists "Guests request pending appointments"     on public.appointments;
drop policy if exists "Staff read their clinic's appointments"  on public.appointments;
drop policy if exists "Staff decide their clinic's appointments" on public.appointments;

create policy "Guests request pending appointments"
  on public.appointments for insert to anon
  with check (
    status = 'pending'
    and staff_note = ''
    and slot_date >= public.clinic_today(clinic_id)   -- NULL for unknown clinic => rejected
  );

create policy "Staff read their clinic's appointments"
  on public.appointments for select to authenticated
  using (public.is_staff_of(clinic_id));

create policy "Staff decide their clinic's appointments"
  on public.appointments for update to authenticated
  using (public.is_staff_of(clinic_id))
  with check (public.is_staff_of(clinic_id));

-- Public availability: only taken times for one clinic, from today, within ~3 months.
create or replace function public.get_taken_slots(p_clinic_id uuid, p_from date, p_to date)
returns table (slot_date date, slot_time text)
language sql stable security definer set search_path = ''
as $$
  select a.slot_date, a.slot_time
  from public.appointments a
  where a.clinic_id = p_clinic_id
    and a.status <> 'declined'
    and a.slot_date >= greatest(p_from, public.clinic_today(p_clinic_id))
    and a.slot_date <= p_to
    and p_to - p_from <= 92
  order by a.slot_date, a.slot_time;
$$;

revoke execute on function public.get_taken_slots(uuid, date, date) from public, anon, authenticated;
grant  execute on function public.get_taken_slots(uuid, date, date) to anon, authenticated;
