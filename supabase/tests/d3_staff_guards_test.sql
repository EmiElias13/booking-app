-- D3 staff guards (migration 20261016000750): no role changes from the app, last active admin
-- stays, no blank display names. pgTAP, rolls back.
-- Locally: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/d3_staff_guards_test.sql
begin;
select plan(22);

-- ============ fixtures (service role) ============
insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001','admin1-g@test.local'),
  ('c1000000-0000-4000-8000-000000000002','admin2-g@test.local'),
  ('c1000000-0000-4000-8000-000000000003','t1-g@test.local'),
  ('c1000000-0000-4000-8000-000000000004','desk-g@test.local'),
  ('c2000000-0000-4000-8000-000000000001','admin-h@test.local');
insert into public.clinics (id, slug, name, plan) values
  ('c1000000-0000-4000-8000-00000000000c','guard-g','Guard G','clinica'),
  ('c2000000-0000-4000-8000-00000000000c','guard-h','Guard H','basico');
insert into public.staff (user_id, clinic_id, role, display_name, active) values
  ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-00000000000c','admin','Admin 1',true),
  ('c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-00000000000c','admin','Admin 2',true),
  ('c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-00000000000c','therapist','Terapeuta',true),
  ('c1000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-00000000000c','front_desk','',true),
  ('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000c','admin','Admin H',true);

-- ============ [R] role changes ============
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$update public.staff set role = 'front_desk' where user_id = 'c1000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'R1 admin cannot change a therapist''s role');
select throws_ok($$update public.staff set role = 'admin' where user_id = 'c1000000-0000-4000-8000-000000000004'$$,
  '42501', null, 'R2 admin cannot promote front desk to admin');
select lives_ok($$update public.staff set role = 'therapist', display_name = 'Terapeuta' where user_id = 'c1000000-0000-4000-8000-000000000003'$$,
  'R3 sending the unchanged role along with other edits is fine');
reset role;
insert into auth.users (id, email) values ('c1000000-0000-4000-8000-000000000005','new-g@test.local');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001"}',true);
select lives_ok($$insert into public.staff (user_id, clinic_id, role, display_name) values ('c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-00000000000c','therapist','Nueva')$$,
  'R4 admin still picks the role when adding staff');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000003"}',true);
select is_empty($$update public.staff set role = 'admin' where user_id = 'c1000000-0000-4000-8000-000000000003' returning 1$$,
  'R5 therapist self-escalation still blocked by RLS');
reset role;
select is((select role from public.staff where user_id = 'c1000000-0000-4000-8000-000000000003'), 'therapist', 'R6 therapist role unchanged');
select lives_ok($$update public.staff set role = 'front_desk' where user_id = 'c1000000-0000-4000-8000-000000000005'$$,
  'R7 service role can still change roles');
select is((select role from public.staff where user_id = 'c1000000-0000-4000-8000-000000000005'), 'front_desk', 'R8 service role change applied');

-- ============ [N] blank display name ============
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$update public.staff set display_name = '' where user_id = 'c1000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'N1 empty name rejected');
select throws_ok($$update public.staff set display_name = '   ' where user_id = 'c1000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'N2 whitespace-only name rejected');
select lives_ok($$update public.staff set display_name = '  Paulina  ' where user_id = 'c1000000-0000-4000-8000-000000000003'$$,
  'N3 padded name accepted');
select is((select display_name from public.staff where user_id = 'c1000000-0000-4000-8000-000000000003'), 'Paulina', 'N4 name stored trimmed');
select lives_ok($$update public.staff set active = true, sort_order = 3 where user_id = 'c1000000-0000-4000-8000-000000000004'$$,
  'N5 legacy blank-name row can still be edited without touching the name');

-- ============ [A] last active admin ============
select lives_ok($$update public.staff set active = false where user_id = 'c1000000-0000-4000-8000-000000000002'$$,
  'A1 admin 1 deactivates admin 2 (another active admin remains)');
select throws_ok($$update public.staff set active = false where user_id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'A2 last active admin cannot deactivate themselves');
select throws_ok($$delete from public.staff where user_id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'A3 last active admin cannot be deleted');
select lives_ok($$update public.staff set display_name = 'Admin Uno' where user_id = 'c1000000-0000-4000-8000-000000000001'$$,
  'A4 last admin can still edit their own name');
select lives_ok($$delete from public.staff where user_id = 'c1000000-0000-4000-8000-000000000002'$$,
  'A5 an inactive admin can be removed');
select lives_ok($$update public.staff set active = false where user_id = 'c1000000-0000-4000-8000-000000000003'$$,
  'A6 deactivating a therapist is unaffected');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"c2000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$update public.staff set active = false where user_id = 'c2000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'A7 sole admin of another clinic cannot deactivate themselves either');
reset role;
select is((select count(*)::int from public.staff where role = 'admin' and active and clinic_id in ('c1000000-0000-4000-8000-00000000000c','c2000000-0000-4000-8000-00000000000c')), 2,
  'A8 each clinic still has its active admin');
select lives_ok($$update public.staff set active = false where user_id = 'c2000000-0000-4000-8000-000000000001'$$,
  'A9 service role can still deactivate (manual recovery/cleanup)');

select * from finish();
rollback;
