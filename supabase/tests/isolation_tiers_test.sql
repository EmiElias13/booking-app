-- PR 2 QA suite: multi-clinic isolation + tiers (plan/staff_limit, roles, has_role, staff_id).
-- Matches Emiliano's decisions of 2026-10-12:
--   roles (D3 0800): admin + front_desk see and decide every appointment of their clinic, a therapist only their own; only admin manages staff;
--          staff_id is server-only (not settable from the browser).
--   limits: basico 3, clinica 6, follows plan; per-clinic manual override is service-role/SQL only (admins cannot change it).
--   downgrade: existing staff stay, new inserts blocked while over the limit.
--   removed staff: appointments kept, staff_id -> NULL.
-- pgTAP style for `supabase test db` (copy to supabase/tests/). Everything rolls back.
-- Fallback without pgTAP: load /workspace/qa/pr2-scratch/pgtap_shim.sql first, then
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f isolation_tiers_test.sql
-- Assumed names: clinics.plan, clinics.staff_limit (NULL = plan default), clinic_staff_limit(uuid),
--   has_role(uuid, text[]), appointments.staff_id.
-- Sections: [P] ported 15  [G] guest  [R] RPC  [L] limits  [O] role values  [H] has_role
--           [M] staff management  [T] therapist  [F] front desk  [S] staff_id  [D] deletes  [N] no past slots today  [V] verifications
begin;
select plan(119);

-- ============ fixtures (service role) ============
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001','admin-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000002','therapist1-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000003','desk-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000004','therapist2-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000005','new-a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000001','admin-b@test.local'),
  ('cccccccc-0000-4000-8000-000000000001','random@test.local'),
  ('eeeeeeee-0000-4000-8000-000000000001','l1@test.local'),
  ('eeeeeeee-0000-4000-8000-000000000002','l2@test.local'),
  ('eeeeeeee-0000-4000-8000-000000000003','l3@test.local');
insert into public.clinics (id, slug, name, plan) values
  ('aaaaaaaa-0000-4000-8000-00000000000c','clinic-a','Clinic A','clinica'),
  ('bbbbbbbb-0000-4000-8000-00000000000c','clinic-b','Clinic B','basico');
insert into public.clinics (id, slug, name, plan, staff_limit) values
  ('eeeeeeee-0000-4000-8000-00000000000c','clinic-l','Clinic L (override)','basico',2);
insert into public.clinics (id, slug, name) values ('dddddddd-0000-4000-8000-0000000000dc','clinic-d','Defaults');
insert into public.staff (user_id, clinic_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-00000000000c','admin'),
  ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-00000000000c','therapist'),
  ('aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-00000000000c','front_desk'),
  ('aaaaaaaa-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-00000000000c','therapist'),
  ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-00000000000c','admin');
-- a1: assigned to therapist1, a3: assigned to therapist2, b1: clinic B. (a2 = unassigned legacy row, inserted below after P3)
insert into public.appointments (id, clinic_id, client_name, email, service, notes, slot_date, slot_time, staff_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1','aaaaaaaa-0000-4000-8000-00000000000c','Paciente A','a@x.com','initial','Dolor de rodilla',current_date+3,'09:00','aaaaaaaa-0000-4000-8000-000000000002'),
  ('aaaaaaaa-0000-4000-8000-0000000000a3','aaaaaaaa-0000-4000-8000-00000000000c','Paciente A3','a3@x.com','initial','Hombro',current_date+4,'11:00','aaaaaaaa-0000-4000-8000-000000000004'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1','bbbbbbbb-0000-4000-8000-00000000000c','Paciente B','b@x.com','initial','',current_date+3,'10:00','bbbbbbbb-0000-4000-8000-000000000001');

-- ============ [L] plan and staff limit (service role) ============
select is((select plan from public.clinics where slug='clinic-d'), 'basico', 'L1 plan defaults to basico');
select is(public.clinic_staff_limit('dddddddd-0000-4000-8000-0000000000dc'), 3, 'L2 basico limit = 3');
select is(public.clinic_staff_limit('aaaaaaaa-0000-4000-8000-00000000000c'), 6, 'L3 clinica limit = 6');
select throws_ok($$update public.clinics set plan='premium' where slug='clinic-d'$$, '23514', null, 'L4 plan only accepts basico|clinica');
select lives_ok($$update public.clinics set plan='clinica' where slug='clinic-d'$$, 'L5a change plan');
select is(public.clinic_staff_limit('dddddddd-0000-4000-8000-0000000000dc'), 6, 'L5b limit follows the plan when there is no override');
-- basico without override: B has 1 staff
select lives_ok($$insert into public.staff (user_id, clinic_id) values
  ('eeeeeeee-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-00000000000c'),
  ('eeeeeeee-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-00000000000c')$$, 'L6 basico: staff up to 3 succeeds');
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('eeeeeeee-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-00000000000c')$$, '23514', null, 'L7 basico: 4th staff rejected');
select lives_ok($$insert into public.staff (user_id, clinic_id) values ('eeeeeeee-0000-4000-8000-000000000003','dddddddd-0000-4000-8000-0000000000dc')$$, 'L8 limit is per clinic: same user fits elsewhere');
select throws_ok($$update public.staff set clinic_id='bbbbbbbb-0000-4000-8000-00000000000c' where user_id='eeeeeeee-0000-4000-8000-000000000003'$$, '23514', null, 'L9 moving staff into a full clinic via UPDATE is rejected');
-- downgrade: A has 4 staff, clinica -> basico (3)
select lives_ok($$update public.clinics set plan='basico' where slug='clinic-a'$$, 'L10 downgrade over the limit is allowed');
select is((select count(*)::int from public.staff where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c'), 4, 'L11 downgrade keeps existing staff');
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('aaaaaaaa-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-00000000000c')$$, '23514', null, 'L12 new staff blocked while over the limit');
update public.clinics set plan='clinica' where slug='clinic-a';
-- per-clinic manual override: service-role/SQL only (Emiliano, 2026-10-12)
select is(public.clinic_staff_limit('eeeeeeee-0000-4000-8000-00000000000c'), 2, 'L13 service-role override beats the plan default');
select lives_ok($$insert into public.staff (user_id, clinic_id) values
  ('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-00000000000c'),
  ('eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-0000-4000-8000-00000000000c')$$, 'L14 override: up to 2 succeeds');
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-00000000000c')$$, '23514', null, 'L15 override: 3rd rejected');
select throws_ok($$update public.clinics set staff_limit=0 where slug='clinic-l'$$, '23514', null, 'L16 override must be > 0');
select lives_ok($$update public.clinics set staff_limit=null where slug='clinic-l';
  insert into public.staff (user_id, clinic_id) values ('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-00000000000c')$$, 'L17 service role clearing the override returns to the plan default (3)');

-- ============ [O] role values ============
select throws_ok($$update public.staff set role='owner' where user_id='bbbbbbbb-0000-4000-8000-000000000001'$$, '23514', null, 'O1 legacy role owner rejected');
select throws_ok($$update public.staff set role='staff' where user_id='bbbbbbbb-0000-4000-8000-000000000001'$$, '23514', null, 'O2 legacy role staff rejected');
select throws_ok($$update public.staff set role='superadmin' where user_id='bbbbbbbb-0000-4000-8000-000000000001'$$, '23514', null, 'O3 arbitrary role rejected');
select throws_ok($$update public.staff set role=null where user_id='bbbbbbbb-0000-4000-8000-000000000001'$$, '23502', null, 'O4 role is NOT NULL');
select is((select count(distinct role)::int from public.staff where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c'), 3, 'O5 admin, therapist, front_desk all accepted');

-- ============ [S] staff_id structure (service role) ============
select is((select is_nullable from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='staff_id'), 'YES', 'S1 appointments.staff_id is nullable');
select lives_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('eeeeeeee-0000-4000-8000-00000000000c','Sin staff','s@x.com','initial',current_date+5,'12:00')$$, 'S2 appointment without staff_id is valid');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, staff_id) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+5,'13:00','99999999-0000-4000-8000-000000000001')$$, '23503', null, 'S3 FK: unknown staff_id rejected');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, staff_id) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+5,'14:00','bbbbbbbb-0000-4000-8000-000000000001')$$, '23503', null, 'S4 staff_id cannot point at staff of another clinic');
select throws_ok($$update public.appointments set staff_id='bbbbbbbb-0000-4000-8000-000000000001' where id='aaaaaaaa-0000-4000-8000-0000000000a1'$$, '23503', null, 'S5 same cross-clinic guard on UPDATE');

-- ============ anon ============
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select 1 from public.appointments$$, '42501', null, 'P1 anon cannot read appointments');
select throws_ok($$select 1 from public.clinics$$, '42501', null, 'P2 anon cannot read clinics');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, phone, service, slot_date, slot_time, staff_id) values ('aaaaaaaa-0000-4000-8000-00000000000c','x','x@example.com','1','x',current_date + 7,'10:00','aaaaaaaa-0000-4000-8000-000000000002')$$, '42501', null, 'P16 anon insert with staff_id set is rejected');
select ok(not has_function_privilege('anon','public.enforce_staff_limit()','execute') and not has_function_privilege('authenticated','public.enforce_staff_limit()','execute'), 'P17 anon/authenticated cannot execute enforce_staff_limit');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, phone, service, slot_date, slot_time) values ('eeeeeeee-0000-4000-8000-00000000000c','x','x@example.com','1','x',public.clinic_today('eeeeeeee-0000-4000-8000-00000000000c'),'00:00')$$, '42501', null, 'N1 anon insert for today at a past time is rejected');
-- N2 can only fail during the clinic's last minute of the day (23:59).
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, phone, service, slot_date, slot_time) values ('eeeeeeee-0000-4000-8000-00000000000c','x','x@example.com','1','x',public.clinic_today('eeeeeeee-0000-4000-8000-00000000000c'),'23:59')$$, '42501', null, 'N2 (0800) anon direct insert for later today is rejected: guests use request_appointment');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, phone, service, slot_date, slot_time) values ('eeeeeeee-0000-4000-8000-00000000000c','x','x@example.com','1','x',public.clinic_today('eeeeeeee-0000-4000-8000-00000000000c') + 1,'08:00')$$, '42501', null, 'N3 (0800) anon direct insert for tomorrow is rejected');
select ok((select count(*) = 1 from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c',current_date,current_date+30,'aaaaaaaa-0000-4000-8000-000000000002'))
      and not exists (select 1 from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c',current_date,current_date+30,'bbbbbbbb-0000-4000-8000-000000000001'))
      and (select count(*) = 0 from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c',current_date,current_date+365,'aaaaaaaa-0000-4000-8000-000000000002')),
  'P3 get_taken_slots is clinic-scoped and range-capped');
select throws_ok($$insert into public.appointments (id, clinic_id, client_name, email, service, notes, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-0000000000a2','aaaaaaaa-0000-4000-8000-00000000000c','Nuevo','n@x.com','initial','Espalda',current_date+3,'10:00')$$, '42501', null, 'P4 (0800) anon cannot insert appointments directly');
select ok(not has_table_privilege('anon','public.appointments','insert'), 'P5 (0800) anon has no insert privilege on appointments');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, status) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00','approved')$$, '42501', null, 'P6 anon cannot set status');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date-1,'09:00')$$, '42501', null, 'P7 past date rejected by RLS');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('dddddddd-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00')$$, '42501', null, 'P8 unknown clinic rejected');
select throws_ok($$insert into public.appointments (client_name, email, service, slot_date, slot_time) values ('X','x@x.com','initial',current_date+6,'09:00')$$, null, null, 'P9 missing clinic_id rejected');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, staff_note) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00','hola')$$, '42501', null, 'G1 anon cannot write staff_note');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, staff_id) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00','aaaaaaaa-0000-4000-8000-000000000002')$$, '42501', null, 'G2 anon cannot spoof staff_id');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, requested_at) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00',now()-interval '1 year')$$, '42501', null, 'G3 anon cannot backdate requested_at');
select throws_ok($$update public.appointments set status='approved'$$, '42501', null, 'G4 anon cannot update appointments');
select throws_ok($$delete from public.appointments$$, '42501', null, 'G5 anon cannot delete appointments');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'9am')$$, '42501', null, 'G6 anon direct insert rejected (format check covered as service role in G6b)');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, notes) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:30',repeat('n',2001))$$, '42501', null, 'G7 anon direct insert rejected (length check covered in G7b)');
select throws_ok($$select 1 from public.staff$$, '42501', null, 'G8 anon cannot read staff');
select throws_ok($$select public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['admin'])$$, '42501', null, 'G9 anon cannot execute has_role');
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('cccccccc-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-00000000000c')$$, '42501', null, 'G10 anon cannot add staff');
select is(pg_get_function_result('public.get_taken_slots(uuid,date,date,uuid)'::regprocedure), 'TABLE(slot_date date, slot_time text)', 'R1 get_taken_slots returns only slot_date, slot_time (no id/name/email/status/notes/staff_id)');
select is((select count(*)::int from public.get_taken_slots('bbbbbbbb-0000-4000-8000-00000000000c',current_date,current_date+30,'bbbbbbbb-0000-4000-8000-000000000001')), 1, 'R2 clinic B availability = only its own 1 slot');
select is((select count(*)::int from public.get_taken_slots('dddddddd-0000-4000-8000-0000000000dc',current_date,current_date+30,'aaaaaaaa-0000-4000-8000-000000000002')), 0, 'R3 empty clinic returns nothing');
select ok(to_regprocedure('public.get_taken_slots(uuid,date,date)') is null, 'R4 (0900) clinic-wide 3-arg get_taken_slots is gone');
reset role;
insert into public.appointments (id, clinic_id, client_name, email, service, notes, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-0000000000a2','aaaaaaaa-0000-4000-8000-00000000000c','Nuevo','n@x.com','initial','Espalda',current_date+3,'10:00');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, staff_id) values ('aaaaaaaa-0000-4000-8000-00000000000c','Dup','d@x.com','initial',current_date+3,'09:00','aaaaaaaa-0000-4000-8000-000000000002')$$, '23505', null, 'P5b same therapist, same slot -> 23505');
select lives_ok($$insert into public.appointments (id, clinic_id, client_name, email, service, slot_date, slot_time, staff_id) values ('aaaaaaaa-0000-4000-8000-0000000000a9','aaaaaaaa-0000-4000-8000-00000000000c','Otro','o@x.com','initial',current_date+3,'09:00','aaaaaaaa-0000-4000-8000-000000000004')$$, 'P5c (0800) other therapist, same slot -> OK');
delete from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a9';
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'9am')$$, '23514', null, 'G6b malformed slot_time rejected');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, notes) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:30',repeat('n',2001))$$, '23514', null, 'G7b oversized notes rejected');

-- ============ admin of clinic A ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok((select count(*) from public.appointments where clinic_id <> 'aaaaaaaa-0000-4000-8000-00000000000c') = 0
      and (select count(*) from public.appointments) = 3 and (select count(*) from public.clinics) = 1, 'P10 admin A reads all of clinic A (3) and nothing else');
update public.appointments set status='approved' where id='bbbbbbbb-0000-4000-8000-0000000000b1';  -- verified in V1
update public.appointments set status='approved', staff_note='Nos vemos' where id='aaaaaaaa-0000-4000-8000-0000000000a1';
select is((select status from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a1'), 'approved', 'P11 admin A decides own-clinic row');
select throws_ok($$update public.appointments set clinic_id='bbbbbbbb-0000-4000-8000-00000000000c' where id='aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'P12 clinic_id is not updatable');
select throws_ok($$update public.appointments set client_name='edited' where id='aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'P13 patient fields read-only for staff');
select throws_ok($$insert into public.staff (user_id, clinic_id, role) values ('aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-00000000000c','admin')$$, '42501', null, 'P14 admin A cannot add themselves to clinic B');
select ok(public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['admin']), 'H1 admin A: has_role(A,[admin]) true');
select ok(not public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['therapist','front_desk']), 'H2 admin A: has_role(A,[therapist,front_desk]) false');
select ok(not public.has_role('bbbbbbbb-0000-4000-8000-00000000000c', array['admin','therapist','front_desk']), 'H3 admin A: never true for clinic B');
select ok(not coalesce(public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array[]::text[]), false), 'H4 empty role list -> false');
select ok(not coalesce(public.has_role(null, array['admin']), false), 'H5 null clinic -> false');
-- [M] staff management
select lives_ok($$insert into public.staff (user_id, clinic_id, role) values ('aaaaaaaa-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-00000000000c','front_desk')$$, 'M1 admin adds staff to own clinic');
-- 20261016000750: roles are no longer changed from the app (admin picks one on insert only).
select throws_ok($$update public.staff set role='therapist' where user_id='aaaaaaaa-0000-4000-8000-000000000005' and clinic_id='aaaaaaaa-0000-4000-8000-00000000000c'$$, '42501', null, 'M2 admin cannot change a role (service role only since 0750)');
reset role;
update public.staff set role='therapist' where user_id='aaaaaaaa-0000-4000-8000-000000000005' and clinic_id='aaaaaaaa-0000-4000-8000-00000000000c';  -- same end state as before 0750
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-00000000000c')$$, '42501', null, 'M3 admin A cannot add staff to clinic B');
update public.staff set role='front_desk' where clinic_id='bbbbbbbb-0000-4000-8000-00000000000c';  -- verified in V2
select throws_ok($$update public.staff set clinic_id='bbbbbbbb-0000-4000-8000-00000000000c' where user_id='aaaaaaaa-0000-4000-8000-000000000005'$$, '42501', null, 'M4 admin A cannot move staff into clinic B');
select throws_ok($$update public.clinics set plan='clinica'$$, '42501', null, 'M5 admin cannot change the plan (service role only)');
select throws_ok($$update public.clinics set staff_limit=99$$, '42501', null, 'M5b admin cannot set the manual staff_limit override (service-role/SQL only)');
select throws_ok($$update public.clinics set staff_limit=null$$, '42501', null, 'M5c admin cannot clear the manual override either');
select is((select count(*)::int from public.staff where clinic_id='bbbbbbbb-0000-4000-8000-00000000000c'), 0, 'M6 admin A cannot see clinic B staff');
select throws_ok($$update public.appointments set staff_id='aaaaaaaa-0000-4000-8000-000000000004' where id='aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'S6 staff_id not settable from the browser (who assigns: open question)');
select is((select count(*)::int from public.appointments where staff_id='bbbbbbbb-0000-4000-8000-000000000001'), 0, 'S7 admin A cannot find clinic B rows by staff_id');
select throws_ok($$delete from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'D1 admin cannot delete appointments');
select throws_ok($$delete from public.clinics$$, '42501', null, 'D2 admin cannot delete clinics');
delete from public.staff where clinic_id='bbbbbbbb-0000-4000-8000-00000000000c';  -- verified in V2
reset role;

-- ============ therapist 1 of clinic A ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['therapist']) and not public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['admin']), 'H6 therapist: true only for therapist');
select is((select array_agg(id order by id)::text from public.appointments), '{aaaaaaaa-0000-4000-8000-0000000000a1}', 'T1 (0800) therapist sees only own appointments (not unassigned, not other therapist''s)');
select is((select count(*)::int from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a3'), 0, 'T2 (0800) therapist cannot read another therapist''s appointment');
update public.appointments set status='approved' where id='aaaaaaaa-0000-4000-8000-0000000000a2';  -- verified in T3
update public.appointments set status='declined', staff_note='Lo siento' where id='aaaaaaaa-0000-4000-8000-0000000000a1';
select is((select status from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a1'), 'declined', 'T4 therapist can decline own appointment');
update public.appointments set status='declined' where id='aaaaaaaa-0000-4000-8000-0000000000a3';  -- verified in V3
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('cccccccc-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-00000000000c')$$, '42501', null, 'T5 therapist cannot add staff');
update public.staff set role='admin' where user_id='aaaaaaaa-0000-4000-8000-000000000002';  -- self-escalation, verified in V4
select throws_ok($$delete from public.appointments$$, '42501', null, 'D3 therapist cannot delete appointments');
delete from public.staff where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c';  -- verified in V5
select throws_ok($$delete from public.clinics$$, '42501', null, 'D4 therapist cannot delete clinics');
select is((select count(*)::int from public.appointments where clinic_id='bbbbbbbb-0000-4000-8000-00000000000c'), 0, 'S8 therapist sees no clinic B rows');
reset role;

-- ============ therapist 2 of clinic A ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a1'), 0, 'T6 (0800) therapist 2 cannot see therapist 1''s appointment');
select is((select count(*)::int from public.appointments), 1, 'T7 (0800) therapist 2 sees only own row');
select throws_ok($$update public.appointments set staff_id='aaaaaaaa-0000-4000-8000-000000000004' where id='aaaaaaaa-0000-4000-8000-0000000000a3'$$, '42501', null, 'T8 therapist cannot reassign staff_id');
reset role;
select is((select status from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a3'), 'pending', 'V3 (0800) therapist 1 could not decide therapist 2''s appointment');
select is((select status from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a2'), 'pending', 'T3 (0800) therapist could not approve an unassigned appointment');
select is((select role from public.staff where user_id='aaaaaaaa-0000-4000-8000-000000000002'), 'therapist', 'V4 therapist could not self-escalate to admin');
select is((select count(*)::int from public.staff where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c'), 5, 'V5 therapist could not delete staff');

-- ============ front desk of clinic A ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['front_desk','therapist']) and not public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['admin']), 'H7 front_desk: any-of semantics');
select is((select count(*)::int from public.appointments), 3, 'F1 front desk sees the whole clinic (incl. both therapists'' rows)');
select is((select string_agg(notes, '|' order by id) from public.appointments), 'Dolor de rodilla|Espalda|Hombro', 'F2 front desk reads notes across the clinic');
update public.appointments set status='approved', staff_note='Confirmado' where id='aaaaaaaa-0000-4000-8000-0000000000a3';
select is((select status from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a3'), 'approved', 'F3 front desk approves an appointment assigned to a therapist');
update public.appointments set status='declined' where id='aaaaaaaa-0000-4000-8000-0000000000a2';
select is((select status from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a2'), 'declined', 'F4 front desk declines');
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('cccccccc-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-00000000000c')$$, '42501', null, 'F5 front desk cannot add staff');
update public.staff set role='admin' where user_id='aaaaaaaa-0000-4000-8000-000000000003';  -- verified in V6
select throws_ok($$delete from public.appointments$$, '42501', null, 'D5 front desk cannot delete appointments');
delete from public.staff where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c';  -- verified in V6
select throws_ok($$delete from public.clinics$$, '42501', null, 'D6 front desk cannot delete clinics');
select is((select count(*)::int from public.appointments where clinic_id='bbbbbbbb-0000-4000-8000-00000000000c'), 0, 'F6 front desk sees no clinic B rows');
reset role;
select ok((select role from public.staff where user_id='aaaaaaaa-0000-4000-8000-000000000003')='front_desk'
      and (select count(*) from public.staff where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c') = 5, 'V6 front desk could not change roles or delete staff');

-- ============ staff of clinic B ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.appointments where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c'), 0, 'S9 admin B reads no clinic A rows');
update public.appointments set staff_note='hacked-by-B' where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c';  -- verified in V7
delete from public.staff where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c';  -- verified in V7
select throws_ok($$insert into public.staff (user_id, clinic_id, role) values ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-00000000000c','admin')$$, '42501', null, 'M7 admin B cannot enroll in clinic A');
reset role;

-- ============ authenticated non-staff ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.appointments), 0, 'P15 non-staff account sees nothing');
select ok(not public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['admin','therapist','front_desk']), 'H8 non-staff: has_role false');
update public.appointments set status='declined' where id='bbbbbbbb-0000-4000-8000-0000000000b1';  -- verified in V1
select ok((select count(*) from public.staff) = 0 and (select count(*) from public.clinics) = 0, 'S10 non-staff sees no staff or clinics');
select throws_ok($$insert into public.staff (user_id, clinic_id, role) values ('cccccccc-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-00000000000c','admin')$$, '42501', null, 'M8 non-staff cannot self-enroll');
reset role;

-- ============ removing staff (admin A) ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$delete from public.staff where user_id='aaaaaaaa-0000-4000-8000-000000000002' and clinic_id='aaaaaaaa-0000-4000-8000-00000000000c'$$, 'M9 admin removes a therapist from own clinic');
reset role;

-- ============ [V] verifications (service role) ============
select is((select status from public.appointments where id='bbbbbbbb-0000-4000-8000-0000000000b1'), 'pending', 'V1 admin A / non-staff could not decide clinic B row');
select ok((select count(*) from public.staff where clinic_id='bbbbbbbb-0000-4000-8000-00000000000c') = 3
      and (select role from public.staff where user_id='bbbbbbbb-0000-4000-8000-000000000001') = 'admin', 'V2 admin A could not edit or delete clinic B staff');
select ok((select count(*) from public.appointments where staff_note='hacked-by-B') = 0
      and (select count(*) from public.staff where clinic_id='aaaaaaaa-0000-4000-8000-00000000000c') = 4, 'V7 admin B could not write clinic A rows or delete clinic A staff');
select is((select count(*)::int from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a1'), 1, 'X1 removed therapist''s appointment is kept');
select ok((select staff_id is null from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a1')
      and (select clinic_id = 'aaaaaaaa-0000-4000-8000-00000000000c' from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a1'), 'X2 removed therapist -> staff_id NULL, clinic_id intact');

select finish();
rollback;
