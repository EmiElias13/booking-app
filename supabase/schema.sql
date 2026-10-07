create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  email text not null,
  phone text not null default '',
  service text not null,
  notes text not null default '',
  slot_date date not null,
  slot_time text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  physio_note text not null default '',
  requested_at timestamptz not null default now()
);

create unique index if not exists appointments_active_slot
  on appointments (slot_date, slot_time)
  where status <> 'declined';

revoke all on table appointments from anon, authenticated;
grant insert on table appointments to anon;
grant select, update on table appointments to authenticated;

alter table appointments enable row level security;

drop policy if exists "Public can read appointments" on appointments;
drop policy if exists "Public can request appointments" on appointments;
drop policy if exists "Public can update appointments" on appointments;
drop policy if exists "Guests can request pending appointments" on appointments;
drop policy if exists "Physio can read appointments" on appointments;
drop policy if exists "Physio can update appointments" on appointments;

create policy "Guests can request pending appointments"
  on appointments for insert
  to anon
  with check (status = 'pending' and physio_note = '');

create policy "Physio can read appointments"
  on appointments for select
  to authenticated
  using (true);

create policy "Physio can update appointments"
  on appointments for update
  to authenticated
  using (true)
  with check (true);

create or replace view appointment_slots as
  select id, slot_date, slot_time, status
  from appointments;

grant select on appointment_slots to anon, authenticated;
