-- D3 / PR 5: 20261016000800 cutover (spec §8 tests 1, 8, 11, 12). pgTAP, rolls back.
-- 14a (0800 aborts while a staff_id null booking exists) runs against a live-like db, see PR body.
begin;
select * from no_plan();

insert into auth.users (id, email) values
  ('c5000000-0000-4000-8000-000000000001','admin@test.local'),
  ('c5000000-0000-4000-8000-000000000002','ta@test.local'),
  ('c5000000-0000-4000-8000-000000000003','tb@test.local'),
  ('c5000000-0000-4000-8000-000000000004','desk@test.local'),
  ('c5000000-0000-4000-8000-000000000005','other-admin@test.local');
insert into public.clinics (id, slug, name, plan) values
  ('c5000000-0000-4000-8000-00000000000c','cut-a','Cut A','clinica'),
  ('c5000000-0000-4000-8000-00000000000d','cut-b','Cut B','clinica');
insert into public.staff (user_id, clinic_id, role, display_name, active, sort_order) values
  ('c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-00000000000c','admin','Admin',true,0),
  ('c5000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-00000000000c','therapist','Ana',true,1),
  ('c5000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-00000000000c','therapist','Beto',true,2),
  ('c5000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-00000000000c','front_desk','Mostrador',true,3),
  ('c5000000-0000-4000-8000-000000000005','c5000000-0000-4000-8000-00000000000d','admin','Otro',true,0);
insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time)
select 'c5000000-0000-4000-8000-00000000000c', s, d, '08:00', '20:00'
from unnest(array['c5000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000003']::uuid[]) s,
     generate_series(0,6) d;
create temp table cut as select public.clinic_today('c5000000-0000-4000-8000-00000000000c') + 2 as day;
grant select on cut to anon, authenticated;

-- ============ anon (test 1) ============
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select ok(not has_table_privilege('anon','public.appointments','insert'), 'K1 anon has no insert privilege on appointments');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time) values ('c5000000-0000-4000-8000-00000000000c','X','x@x.com','initial',(select day from cut),'10:00')$$,
  '42501', null, 'K2 anon direct insert (no staff_id) rejected');
select throws_ok($$insert into public.appointments (clinic_id, client_name, email, service, slot_date, slot_time, staff_id) values ('c5000000-0000-4000-8000-00000000000c','X','x@x.com','initial',(select day from cut),'10:00','c5000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'K3 anon direct insert with staff_id rejected');
select ok(not exists (select 1 from pg_policies where tablename='appointments' and cmd='INSERT' and 'anon' = any(roles)), 'K4 no anon insert policy left');
-- test 8: per-therapist slots via the RPC
select lives_ok($$select public.request_appointment('c5000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-000000000002',(select day from cut),'10:00','Paciente A','a@x.com','','initial')$$,
  'K5 anon books therapist A 10:00 via RPC');
select lives_ok($$select public.request_appointment('c5000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-000000000003',(select day from cut),'10:00','Paciente B','b@x.com','','initial')$$,
  'K6 therapist A''s 10:00 does not block therapist B''s 10:00');
select throws_ok($$select public.request_appointment('c5000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-000000000002',(select day from cut),'10:00','Otra','o@x.com','','initial')$$,
  'P0001', 'slot_taken', 'K7 same therapist, same slot -> slot_taken');
select ok(exists (select 1 from public.get_available_slots('c5000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-000000000003',(select day from cut)+1,(select day from cut)+1) where slot_time='10:00')
      and not exists (select 1 from public.get_available_slots('c5000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-000000000002',(select day from cut),(select day from cut)) where slot_time='10:00'),
  'K8 get_available_slots hides only the therapist''s own taken slot');
reset role;
select ok(exists (select 1 from public.get_available_slots('c5000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-000000000003',(select day from cut),(select day from cut)) where slot_time='11:00'), 'K8b B still free at 11:00');
select throws_ok($$insert into public.appointments (clinic_id, staff_id, client_name, email, service, slot_date, slot_time) values ('c5000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-000000000003','Dup','d@x.com','initial',(select day from cut),'10:00')$$,
  '23505', null, 'K9 unique index is per therapist (same therapist twice -> 23505)');
select ok((select indexdef like '%(clinic_id, staff_id, slot_date, slot_time)%' from pg_indexes where indexname='appointments_active_slot'), 'K10 appointments_active_slot is (clinic_id, staff_id, slot_date, slot_time)');

-- ============ therapist A (test 11) ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select client_name from public.appointments order by 1$$, array['Paciente A'], 'K11 therapist A sees only own booking');
update public.appointments set status='approved' where client_name='Paciente B';
update public.appointments set status='approved', staff_note='ok' where client_name='Paciente A';
select throws_ok($$update public.appointments set staff_id='c5000000-0000-4000-8000-000000000003' where client_name='Paciente A'$$, '42501', null, 'K12 therapist cannot reassign staff_id');
reset role;
select is((select status from public.appointments where client_name='Paciente B'), 'pending', 'K13 therapist A could not decide B''s booking');
select is((select status from public.appointments where client_name='Paciente A'), 'approved', 'K14 therapist A decided own booking');

-- ============ front desk + admin (test 12) ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c5000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from public.appointments), 2, 'K15 front desk sees the whole clinic');
update public.appointments set status='declined' where client_name='Paciente B';
select set_config('request.jwt.claims','{"sub":"c5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.appointments), 2, 'K16 admin sees the whole clinic');
select set_config('request.jwt.claims','{"sub":"c5000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*)::int from public.appointments), 0, 'K17 admin of another clinic sees nothing');
update public.appointments set status='approved';
reset role;
select is((select status from public.appointments where client_name='Paciente B'), 'declined', 'K18 front desk declined; other-clinic admin changed nothing');

select * from finish();
rollback;
