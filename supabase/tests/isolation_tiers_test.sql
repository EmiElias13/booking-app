-- PR 2 QA suite: multi-clinic isolation + tiers (plan/staff_limit, roles, has_role, staff_id).
-- Matches Emiliano's decisions of 2026-10-12:
--   roles: all three see and decide every appointment of their own clinic; only admin manages staff;
--          staff_id is server-only (not settable from the browser).
--   limits: basico 3, clinica 6, follows plan; per-clinic override = Lead's proposal [PENDING EMILIANO OK].
--   downgrade: existing staff stay, new inserts blocked while over the limit.
--   removed staff: appointments kept, staff_id -> NULL.
-- pgTAP style for `supabase test db` (copy to supabase/tests/). Everything rolls back.
-- Fallback without pgTAP: load /workspace/qa/pr2-scratch/pgtap_shim.sql first, then
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f isolation_tiers_test.sql
-- Assumed names: clinics.plan, clinics.staff_limit (NULL = plan default), clinic_staff_limit(uuid),
--   has_role(uuid, text[]), appointments.staff_id.
-- Sections: [P] ported 15  [G] guest  [R] RPC  [L] limits  [O] role values  [H] has_role
--           [M] staff management  [T] therapist  [F] front desk  [S] staff_id  [D] deletes  [V] verifications
begin;
select plan(106);

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
-- a1: assigned to therapist1, a3: assigned to therapist2, b1: clinic B. (a2 = unassigned, created by anon in P4)
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
-- per-clinic override [PENDING EMILIANO OK]
select is(public.clinic_staff_limit('eeeeeeee-0000-4000-8000-00000000000c'), 2, 'L13 [PENDING] override beats the plan default');
select lives_ok($$insert into public.staff (user_id, clinic_id) values
  ('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-00000000000c'),
  ('eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-0000-4000-8000-00000000000c')$$, 'L14 [PENDING] override: up to 2 succeeds');
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-00000000000c')$$, '23514', null, 'L15 [PENDING] override: 3rd rejected');
select throws_ok($$update public.clinics set staff_limit=0 where slug='clinic-l'$$, '23514', null, 'L16 [PENDING] override must be > 0');
select lives_ok($$update public.clinics set staff_limit=null where slug='clinic-l';
  insert into public.staff (user_id, clinic_id) values ('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-00000000000c')$$, 'L17 [PENDING] clearing the override returns to the plan default (3)');

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
select ok((select count(*) = 2 from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c',current_date,current_date+30))
      and not exists (select 1 from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c',current_date,current_date+30) where slot_time='10:00')
      and (select count(*) = 0 from public.get_taken_slots('aaaaaaaa-0000-4000-8000-00000000000c',current_date,current_date+365)),
  'P3 get_taken_slots is clinic-scoped and range-capped');
select lives_ok($$insert into public.appointments (id, clinic_id, client_name, email, service, notes, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-0000000000a2','aaaaaaaa-0000-4000-8000-00000000000c','Nuevo','n@x.com','initial','Espalda',current_date+3,'10:00')$$, 'P4 anon can request a slot; same hour allowed across clinics');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-00000000000c','Dup','d@x.com','initial',current_date+3,'09:00')$$, '23505', null, 'P5 double booking in one clinic -> 23505');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, status) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00','approved')$$, '42501', null, 'P6 anon cannot set status');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date-1,'09:00')$$, '42501', null, 'P7 past date rejected by RLS');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('dddddddd-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00')$$, '42501', null, 'P8 unknown clinic rejected');
select throws_ok($$insert into public.appointments (client_name, email, service, slot_date, slot_time) values ('X','x@x.com','initial',current_date+6,'09:00')$$, null, null, 'P9 missing clinic_id rejected');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, staff_note) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00','hola')$$, '42501', null, 'G1 anon cannot write staff_note');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, staff_id) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00','aaaaaaaa-0000-4000-8000-000000000002')$$, '42501', null, 'G2 anon cannot spoof staff_id');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, requested_at) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:00',now()-interval '1 year')$$, '42501', null, 'G3 anon cannot backdate requested_at');
select throws_ok($$update public.appointments set status='approved'$$, '42501', null, 'G4 anon cannot update appointments');
select throws_ok($$delete from public.appointments$$, '42501', null, 'G5 anon cannot delete appointments');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'9am')$$, '23514', null, 'G6 malformed slot_time rejected');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, notes) values ('aaaaaaaa-0000-4000-8000-00000000000c','X','x@x.com','initial',current_date+6,'09:30',repeat('n',2001))$$, '23514', null, 'G7 oversized notes rejected');
select throws_ok($$select 1 from public.staff$$, '42501', null, 'G8 anon cannot read staff');
select throws_ok($$select public.has_role('aaaaaaaa-0000-4000-8000-00000000000c', array['admin'])$$, '42501', null, 'G9 anon cannot execute has_role');
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('cccccccc-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-00000000000c')$$, '42501', null, 'G10 anon cannot add staff');
select is(pg_get_function_result('public.get_taken_slots(uuid,date,date)'::regprocedure), 'TABLE(slot_date date, slot_time text)', 'R1 get_taken_slots returns only slot_date, slot_time (no id/name/email/status/notes/staff_id)');
select is((select count(*)::int from public.get_taken_slots('bbbbbbbb-0000-4000-8000-00000000000c',current_date,current_date+30)), 1, 'R2 clinic B availability = only its own 1 slot');
select is((select count(*)::int from public.get_taken_slots('dddddddd-0000-4000-8000-0000000000dc',current_date,current_date+30)), 0, 'R3 empty clinic returns nothing');
reset role;

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
update public.staff set role='therapist' where user_id='aaaaaaaa-0000-4000-8000-000000000005' and clinic_id='aaaaaaaa-0000-4000-8000-00000000000c';
select is((select role from public.staff where user_id='aaaaaaaa-0000-4000-8000-000000000005'), 'therapist', 'M2 admin changes a role in own clinic');
select throws_ok($$insert into public.staff (user_id, clinic_id) values ('aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-00000000000c')$$, '42501', null, 'M3 admin A cannot add staff to clinic B');
update public.staff set role='front_desk' where clinic_id='bbbbbbbb-0000-4000-8000-00000000000c';  -- verified in V2
select throws_ok($$update public.staff set clinic_id='bbbbbbbb-0000-4000-8000-00000000000c' where user_id='aaaaaaaa-0000-4000-8000-000000000005'$$, '42501', null, 'M4 admin A cannot move staff into clinic B');
select throws_ok($$update public.clinics set plan='clinica', staff_limit=99$$, '42501', null, 'M5 admin cannot change plan/limit (service role only)');
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
select is((select array_agg(id order by id)::text from public.appointments), '{aaaaaaaa-0000-4000-8000-0000000000a1,aaaaaaaa-0000-4000-8000-0000000000a2,aaaaaaaa-0000-4000-8000-0000000000a3}', 'T1 therapist sees every appointment of own clinic (own, unassigned, other therapist''s)');
select is((select notes from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a3'), 'Hombro', 'T2 therapist sees (incl. notes) an appointment assigned to another therapist');
update public.appointments set status='approved' where id='aaaaaaaa-0000-4000-8000-0000000000a2';
select is((select status from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a2'), 'approved', 'T3 therapist can approve an unassigned appointment');
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
select is((select count(*)::int from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a1'), 1, 'T6 therapist 2 sees therapist 1''s appointment');
select is((select count(*)::int from public.appointments), 3, 'T7 therapist 2 sees the whole clinic and nothing else');
reset role;
select is((select status from public.appointments where id='aaaaaaaa-0000-4000-8000-0000000000a3'), 'declined', 'V3 therapist 1 can decide therapist 2''s appointment');
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
