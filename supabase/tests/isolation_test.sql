-- Cross-clinic isolation checks. Runs in one transaction and rolls back.
-- Locally: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/isolation_test.sql
begin;

-- Fixtures (as the migration owner).
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'staff-a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'staff-b@test.local'),
  ('cccccccc-0000-4000-8000-000000000001', 'random@test.local');
insert into public.clinics (id, slug, name) values
  ('aaaaaaaa-0000-4000-8000-00000000000c', 'clinic-a', 'Clinic A'),
  ('bbbbbbbb-0000-4000-8000-00000000000c', 'clinic-b', 'Clinic B');
insert into public.staff (user_id, clinic_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000c', 'admin'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000c', 'admin');
insert into public.appointments (id, clinic_id, client_name, email, service, slot_date, slot_time) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000c', 'Paciente A', 'a@x.com', 'initial', current_date + 3, '09:00'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000c', 'Paciente B', 'b@x.com', 'initial', current_date + 3, '10:00');

-- ---------- anon ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$ begin
  perform 1 from public.appointments;
  raise exception 'FAIL: anon can select appointments';
exception when insufficient_privilege then raise notice 'ok: anon cannot read appointments';
end $$;

do $$ begin
  perform 1 from public.clinics;
  raise exception 'FAIL: anon can select clinics';
exception when insufficient_privilege then raise notice 'ok: anon cannot read clinics';
end $$;

do $$ declare n int; begin
  select count(*) into n from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c', current_date, current_date + 30);
  assert n = 1, 'FAIL: clinic A should have exactly 1 taken slot, got ' || n;
  assert not exists (select 1 from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c', current_date, current_date + 30) where slot_time = '10:00'),
    'FAIL: clinic B slot leaked into clinic A availability';
  select count(*) into n from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c', current_date, current_date + 365);
  assert n = 0, 'FAIL: oversized range should return nothing';
  raise notice 'ok: get_taken_slots is clinic-scoped and range-capped';
end $$;

-- D3 0800: guests cannot insert directly any more (they book via request_appointment).
do $$ begin
  insert into public.appointments (id, clinic_id, client_name, email, service, slot_date, slot_time)
  values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000c', 'Nuevo', 'n@x.com', 'initial', current_date + 3, '10:00');
  raise exception 'FAIL: anon direct insert allowed';
exception when insufficient_privilege then raise notice 'ok: anon cannot insert appointments directly (0800)';
end $$;

do $$ begin
  insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, status)
  values ('aaaaaaaa-0000-4000-8000-00000000000c', 'X', 'x@x.com', 'initial', current_date + 4, '09:00', 'approved');
  raise exception 'FAIL: anon set status';
exception when insufficient_privilege then raise notice 'ok: anon cannot set status';
end $$;

do $$ begin
  insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time)
  values ('aaaaaaaa-0000-4000-8000-00000000000c', 'X', 'x@x.com', 'initial', current_date - 1, '09:00');
  raise exception 'FAIL: past date accepted';
exception when insufficient_privilege then raise notice 'ok: past date rejected by RLS';
end $$;

do $$ begin
  insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time)
  values ('dddddddd-0000-4000-8000-00000000000c', 'X', 'x@x.com', 'initial', current_date + 4, '09:00');
  raise exception 'FAIL: unknown clinic accepted';
exception when insufficient_privilege or foreign_key_violation then raise notice 'ok: unknown clinic rejected';
end $$;

do $$ begin
  insert into public.appointments (client_name, email, service, slot_date, slot_time)
  values ('X', 'x@x.com', 'initial', current_date + 4, '09:00');
  raise exception 'FAIL: missing clinic accepted';
exception when not_null_violation or insufficient_privilege then raise notice 'ok: missing clinic_id rejected';
end $$;

reset role;

-- second clinic A row (as service role; guests can no longer insert directly)
insert into public.appointments (id, clinic_id, client_name, email, service, slot_date, slot_time)
values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000c', 'Nuevo', 'n@x.com', 'initial', current_date + 3, '10:00');

-- ---------- staff of clinic A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$ declare n int; begin
  select count(*) into n from public.appointments where clinic_id <> 'aaaaaaaa-0000-4000-8000-00000000000c';
  assert n = 0, 'FAIL: staff A sees other clinics';
  select count(*) into n from public.appointments;
  assert n = 2, 'FAIL: staff A should see 2 rows, got ' || n;
  select count(*) into n from public.clinics;
  assert n = 1, 'FAIL: staff A should see only its clinic';
  raise notice 'ok: staff A reads only clinic A';
end $$;

do $$ declare n int; begin
  update public.appointments set status = 'approved' where id = 'bbbbbbbb-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: staff A updated clinic B row';
  update public.appointments set status = 'approved', staff_note = 'Nos vemos' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: staff A cannot decide own row';
  raise notice 'ok: staff A decides only clinic A rows';
end $$;

do $$ begin
  update public.appointments set clinic_id = 'bbbbbbbb-0000-4000-8000-00000000000c' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
  raise exception 'FAIL: staff moved a row to another clinic';
exception when insufficient_privilege then raise notice 'ok: clinic_id is not updatable';
end $$;

do $$ begin
  update public.appointments set client_name = 'edited' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
  raise exception 'FAIL: staff edited patient fields';
exception when insufficient_privilege then raise notice 'ok: patient fields are read-only for staff';
end $$;

do $$ begin
  insert into public.staff (user_id, clinic_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000c');
  raise exception 'FAIL: staff self-enrolled into clinic B';
exception when insufficient_privilege then raise notice 'ok: staff cannot grant themselves clinics';
end $$;

reset role;

-- ---------- signed-in user who is nobody's staff (e.g. open sign-ups) ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.appointments;
  assert n = 0, 'FAIL: non-staff account reads appointments';
  raise notice 'ok: non-staff account sees nothing';
end $$;
reset role;

rollback;
