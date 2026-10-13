-- Rollback of multiclinic_live.sql: returns the project to the baseline 0000 schema (old schema.sql)
-- so the previously deployed single-clinic app works again. One transaction; any error = no change.
--
-- DATA LOSS WARNINGS (read before running):
--   * Drops public.clinics and public.staff: clinic rows, plans/limits and every staff membership are lost.
--   * Drops appointments.clinic_id and appointments.staff_id: which clinic/therapist a booking belonged to is lost.
--   * Appointments themselves are KEPT (staff_note is renamed back to physio_note, contents intact).
--   * Refuses to run if appointments belong to more than one clinic (merging calendars would mix patients
--     of different clinics and could break the one-booking-per-slot index). Delete/export the other
--     clinics' rows deliberately first if you really mean it.
--   * Refuses to run if two active bookings share a date+time (only possible with more than one clinic).
--   * Auth users are untouched. Re-deploy the OLD client right after this commits.
-- Take a backup first: supabase db dump --data-only > backup.sql
-- Safe to re-run: every step is guarded.
\set ON_ERROR_STOP on
begin;

do $$
declare n int;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'appointments' and column_name = 'clinic_id') then
    execute 'select count(distinct clinic_id) from public.appointments' into n;
    if n > 1 then
      raise exception 'Appointments belong to % clinics: rollback would merge calendars. Aborting.', n;
    end if;
  end if;
end $$;

-- 0400: plans, roles, staff_id
drop policy if exists "Admin adds staff" on public.staff;
drop policy if exists "Admin edits staff" on public.staff;
drop policy if exists "Admin removes staff" on public.staff;
drop trigger if exists staff_limit on public.staff;
drop function if exists public.enforce_staff_limit();
drop function if exists public.clinic_staff_limit(uuid);
alter table public.appointments drop constraint if exists appointments_staff_fk;
alter table public.appointments drop column if exists staff_id;

-- 0300: RLS, RPC, constraints, rename
drop function if exists public.get_taken_slots(uuid, date, date);
drop policy if exists "Guests request pending appointments" on public.appointments;
drop policy if exists "Staff read their clinic's appointments" on public.appointments;
drop policy if exists "Staff decide their clinic's appointments" on public.appointments;
drop policy if exists "Staff read appointments by role" on public.appointments;
drop policy if exists "Staff decide appointments by role" on public.appointments;
alter table public.appointments drop constraint if exists appointments_slot_time_format;
alter table public.appointments drop constraint if exists appointments_field_lengths;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'appointments' and column_name = 'staff_note') then
    alter table public.appointments rename column staff_note to physio_note;
  end if;
end $$;
drop index if exists public.appointments_active_slot;

-- 0200 / 0100: tenant column, staff, clinics, helpers
drop index if exists public.appointments_clinic_slot_idx;
alter table public.appointments drop column if exists clinic_id;
drop function if exists public.has_role(uuid, text[]);
drop table if exists public.staff;
drop table if exists public.clinics;
drop function if exists public.is_staff_of(uuid);
drop function if exists public.clinic_today(uuid);

-- Baseline 0000 (old schema.sql), verbatim apart from schema-qualified names.
create unique index if not exists appointments_active_slot
  on public.appointments (slot_date, slot_time)
  where status <> 'declined';

revoke all on table public.appointments from anon, authenticated;
grant insert on table public.appointments to anon;
grant select, update on table public.appointments to authenticated;

alter table public.appointments enable row level security;

drop policy if exists "Guests can request pending appointments" on public.appointments;
drop policy if exists "Physio can read appointments" on public.appointments;
drop policy if exists "Physio can update appointments" on public.appointments;

create policy "Guests can request pending appointments"
  on public.appointments for insert to anon
  with check (status = 'pending' and physio_note = '');

create policy "Physio can read appointments"
  on public.appointments for select to authenticated
  using (true);

create policy "Physio can update appointments"
  on public.appointments for update to authenticated
  using (true) with check (true);

create or replace view public.appointment_slots as
  select id, slot_date, slot_time, status
  from public.appointments;

grant select on public.appointment_slots to anon, authenticated;

commit;
