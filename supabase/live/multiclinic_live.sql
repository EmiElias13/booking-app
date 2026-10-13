-- Multi-clinic migration for an EXISTING single-clinic project (live = baseline 0000 / old schema.sql).
-- One transaction: any error rolls everything back and the live DB is left untouched.
-- Order: 0100 clinics+staff, 0200 clinic_id, backfill, 0300 RLS + get_taken_slots + renames, 0400 plans/roles/staff_id.
-- Re-runnable: every step is guarded (if not exists / drop if exists / on conflict).
-- BREAKING for the currently deployed app (renamed physio_note, dropped appointment_slots view):
-- deploy the new client with VITE_CLINIC_ID = this clinic's id right after this commits.
-- Take a backup first: supabase db dump --data-only > backup.sql (and the schema).
\set ON_ERROR_STOP on
begin;

-- ================= Parameters (EDIT BEFORE RUNNING) =================
-- TODO: replace the three values below. Run with: psql "$DB_URL" -v ON_ERROR_STOP=1 -f multiclinic_live.sql
\set clinic_slug 'TODO-clinic-slug'
\set clinic_name 'TODO Clinic Name'
\set staff_email 'TODO-staff@example.com'

create temp table _live_params on commit drop as
  select :'clinic_slug'::text as clinic_slug, :'clinic_name'::text as clinic_name, :'staff_email'::text as staff_email;

do $$
begin
  if exists (select 1 from _live_params
             where clinic_slug like 'TODO%' or clinic_name like 'TODO%' or staff_email like 'TODO%') then
    raise exception 'Fill in clinic_slug, clinic_name and staff_email at the top of this file first';
  end if;
end $$;

-- ================= 0100 clinics and staff =================
-- PR 2 / 1 of 3: tenants and staff membership. Additive only: safe on the live project.

create table if not exists public.clinics (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique
               check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null check (length(name) between 1 and 120),
  timezone   text not null default 'America/Tijuana',
  created_at timestamptz not null default now()
);

create table if not exists public.staff (
  user_id    uuid not null references auth.users (id) on delete cascade,
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  role       text not null default 'therapist'
               check (role in ('admin', 'therapist', 'front_desk')),
  created_at timestamptz not null default now(),
  primary key (user_id, clinic_id)
);

create index if not exists staff_clinic_id_idx on public.staff (clinic_id);

-- Supabase grants new public tables to anon/authenticated by default; take that back.
revoke all on table public.clinics, public.staff from anon, authenticated;
grant select on table public.clinics, public.staff to authenticated;

alter table public.clinics enable row level security;
alter table public.staff   enable row level security;

-- Helpers. SECURITY DEFINER so policies can consult staff without RLS recursion;
-- empty search_path + schema-qualified names so they can't be hijacked.
create or replace function public.is_staff_of(p_clinic_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.clinic_id = p_clinic_id
      and s.user_id = (select auth.uid())
  );
$$;

create or replace function public.clinic_today(p_clinic_id uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select (now() at time zone c.timezone)::date
  from public.clinics c
  where c.id = p_clinic_id;
$$;

revoke execute on function public.is_staff_of(uuid)  from public, anon, authenticated;
revoke execute on function public.clinic_today(uuid) from public, anon, authenticated;
grant  execute on function public.is_staff_of(uuid)  to authenticated;
grant  execute on function public.clinic_today(uuid) to anon, authenticated;

drop policy if exists "Staff read their clinics" on public.clinics;
create policy "Staff read their clinics"
  on public.clinics for select to authenticated
  using (public.is_staff_of(id));

drop policy if exists "Staff read their clinic's staff" on public.staff;
create policy "Staff read their clinic's staff"
  on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff_of(clinic_id));

-- No insert/update/delete policies: clinics and staff are managed with the
-- service role (SQL editor / dashboard), never from the browser.

-- ================= 0200 appointments.clinic_id =================
-- PR 2 / 2 of 3: add the tenant column, nullable for now. Additive only: safe on the live project.

alter table public.appointments
  add column if not exists clinic_id uuid references public.clinics (id) on delete restrict;

create index if not exists appointments_clinic_slot_idx
  on public.appointments (clinic_id, slot_date, slot_time);


-- ================= Backfill: the existing clinic =================
-- Every existing appointment belongs to this clinic; the existing physio becomes its admin.
insert into public.clinics (slug, name, timezone)
select p.clinic_slug, p.clinic_name, 'America/Tijuana' from _live_params p
on conflict (slug) do nothing;

update public.appointments
set clinic_id = (select c.id from public.clinics c join _live_params p on c.slug = p.clinic_slug)
where clinic_id is null;

do $$
declare n int;
begin
  insert into public.staff (user_id, clinic_id, role)
  select u.id, c.id, 'admin'
  from _live_params p
  join auth.users u on lower(u.email) = lower(p.staff_email)
  join public.clinics c on c.slug = p.clinic_slug
  on conflict (user_id, clinic_id) do update set role = 'admin';
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'No auth.users row for the staff email in _live_params: create or check the user first';
  end if;
end $$;

-- ================= 0300 enforce tenancy =================
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

-- Pre-check (QA finding): the old schema had no length limits. A NOT VALID check still fires on
-- every later UPDATE of an old row, so staff could no longer approve/decline a booking whose notes
-- are too long. Abort here with the offending ids instead; shorten/export those rows, then re-run.
do $$
declare ids text;
begin
  select string_agg(id::text, ', ' order by id::text) into ids
  from public.appointments
  where length(notes) > 2000 or length(staff_note) > 2000
     or length(client_name) not between 1 and 120 or length(email) not between 3 and 254
     or length(phone) > 40 or length(service) not between 1 and 64
     or slot_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  if ids is not null then
    raise exception 'Existing appointments break the new field limits (notes/staff_note <= 2000 chars, etc.): %', ids
      using hint = 'Shorten or export those rows first (e.g. move long notes elsewhere), then re-run. Nothing was changed.';
  end if;
end $$;

-- Guard rails for anonymous inserts (NOT VALID skips the full-table scan; the pre-check above already
-- guarantees existing rows comply, so later updates of old rows keep working).
alter table public.appointments drop constraint if exists appointments_slot_time_format;
alter table public.appointments drop constraint if exists appointments_field_lengths;
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

-- ================= 0400 plans, roles, staff_id =================
-- PR 2 / 4: plans and staff limits, role-based access, staff assignment on appointments.
-- Roles: all roles see and approve/decline every appointment in their own clinic;
-- only admin manages staff. Nobody deletes appointments or clinics.
-- Plan/limit changes are service-role only. On downgrade, existing staff stay; only new staff are blocked.
alter table public.clinics
  add column if not exists plan text not null default 'basico' check (plan in ('basico','clinica')),
  -- NULL = follow the plan (basico 3, clinica 6); non-NULL = per-clinic override for custom deals
  add column if not exists staff_limit int check (staff_limit > 0);


create or replace function public.clinic_staff_limit(p_clinic_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(c.staff_limit, case c.plan when 'clinica' then 6 else 3 end)
  from public.clinics c where c.id = p_clinic_id;
$$;

-- Downgrade: existing staff stay; new inserts/moves are blocked while count >= limit.
create or replace function public.enforce_staff_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int; n int;
begin
  -- BEFORE triggers run before RLS WITH CHECK: refuse non-admins first so the limit error
  -- doesn't leak another clinic's limit/headcount (QA finding).
  if current_setting('role', true) in ('authenticated','anon') and not public.has_role(new.clinic_id, array['admin']) then
    raise exception 'new row violates row-level security policy for table "staff"' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.clinics where id = new.clinic_id for update;   -- serialize concurrent inserts
  lim := public.clinic_staff_limit(new.clinic_id);
  select count(*) into n from public.staff where clinic_id = new.clinic_id;
  if n >= lim then
    raise exception 'staff limit (%) reached for clinic %', lim, new.clinic_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists staff_limit on public.staff;
create trigger staff_limit before insert or update of clinic_id on public.staff
  for each row execute function public.enforce_staff_limit();

create or replace function public.has_role(p_clinic_id uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.clinic_id = p_clinic_id
    and s.user_id = (select auth.uid()) and s.role = any (p_roles));
$$;
revoke execute on function public.has_role(uuid, text[]) from public, anon, authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;
revoke execute on function public.clinic_staff_limit(uuid) from public, anon;
grant execute on function public.clinic_staff_limit(uuid) to authenticated;

-- Composite FK = staff_id must be staff of the SAME clinic. Removing staff keeps the appointment.
alter table public.appointments drop constraint if exists appointments_staff_fk;
alter table public.appointments add column if not exists staff_id uuid,
  add constraint appointments_staff_fk foreign key (staff_id, clinic_id)
    references public.staff (user_id, clinic_id) on delete set null (staff_id);

-- Appointments: every role (admin, therapist, front_desk) reads and decides all of its own clinic's
-- appointments. The 0300 policies ("Staff read/decide their clinic's appointments", is_staff_of) stay as-is.

-- Staff management: admin of that clinic only.
grant insert, delete on table public.staff to authenticated;
grant update (role) on table public.staff to authenticated;
drop policy if exists "Admin adds staff" on public.staff;
create policy "Admin adds staff" on public.staff for insert to authenticated
  with check (public.has_role(clinic_id, array['admin']));
drop policy if exists "Admin edits staff" on public.staff;
create policy "Admin edits staff" on public.staff for update to authenticated
  using (public.has_role(clinic_id, array['admin'])) with check (public.has_role(clinic_id, array['admin']));
drop policy if exists "Admin removes staff" on public.staff;
create policy "Admin removes staff" on public.staff for delete to authenticated
  using (public.has_role(clinic_id, array['admin']));

-- ================= Sanity check =================
do $$
begin
  if exists (select 1 from public.appointments where clinic_id is null) then
    raise exception 'Sanity check failed: appointments with NULL clinic_id';
  end if;
  if not exists (select 1 from public.staff s join public.clinics c on c.id = s.clinic_id
                 join _live_params p on p.clinic_slug = c.slug where s.role = 'admin') then
    raise exception 'Sanity check failed: the clinic has no admin';
  end if;
end $$;

select c.id as clinic_id_for_VITE_CLINIC_ID, c.slug, c.name,
       (select count(*) from public.appointments a where a.clinic_id = c.id) as appointments,
       (select count(*) from public.staff s where s.clinic_id = c.id) as staff
from public.clinics c join _live_params p on p.clinic_slug = c.slug;

commit;
