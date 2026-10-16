-- D3 per-therapist calendars (spec: docs/specs/d3-therapist-calendars.md, §8).
-- pgTAP, rolls back. Locally: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/d3_therapist_calendars_test.sql
-- Covers migration 20261016000700 (additive). Cutover tests (anon insert gone, per-therapist index,
-- therapist-only visibility) are added with 20261016000800.
begin;
select * from no_plan();

-- ============ fixtures (service role) ============
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001','admin-a@test.local'),
  ('a0000000-0000-4000-8000-000000000002','t1-a@test.local'),
  ('a0000000-0000-4000-8000-000000000003','t2-a@test.local'),
  ('a0000000-0000-4000-8000-000000000004','desk-a@test.local'),
  ('a0000000-0000-4000-8000-000000000005','t3-inactive-a@test.local'),
  ('b0000000-0000-4000-8000-000000000001','admin-b@test.local'),
  ('b0000000-0000-4000-8000-000000000002','t1-b@test.local');
insert into public.clinics (id, slug, name, plan) values
  ('a0000000-0000-4000-8000-00000000000c','d3-a','D3 A','clinica'),
  ('b0000000-0000-4000-8000-00000000000c','d3-b','D3 B','basico');
insert into public.staff (user_id, clinic_id, role, display_name, active, sort_order) values
  ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000c','admin','Admin A',true,0),
  ('a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-00000000000c','therapist','Francia',true,1),
  ('a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-00000000000c','therapist','Paulina',true,2),
  ('a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-00000000000c','front_desk','Recepción',true,0),
  ('a0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000c','therapist','Inactiva',false,3),
  ('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-00000000000c','admin','Admin B',true,0),
  ('b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-00000000000c','therapist','Terapeuta B',true,1);

-- Dates relative to clinic A's today: next Monday/Tuesday/Wednesday/Thursday/Sunday strictly after today.
create temp table d3 as
  with t as (select public.clinic_today('a0000000-0000-4000-8000-00000000000c') + 1 as d)
  select t.d - 1 as today,
         t.d + ((1 - extract(dow from t.d)::int + 7) % 7) as mon
  from t;
alter table d3 add column tue date, add column wed date, add column thu date, add column sun date;
update d3 set tue = mon + 1, wed = mon + 2, thu = mon + 3, sun = mon + 6;
grant select on d3 to anon, authenticated;

-- Francia: Mon–Sat 08–20 (seed). Paulina: Mon split 08–13 + 15–19. Inactive and admin get hours too (must still be refused).
insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time)
select 'a0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000002', wd, '08:00', '20:00' from generate_series(1,6) wd;
insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time) values
  ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',1,'08:00','13:00'),
  ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',1,'15:00','19:00'),
  ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000005',1,'08:00','20:00'),
  ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000001',1,'08:00','20:00'),
  ('b0000000-0000-4000-8000-00000000000c','b0000000-0000-4000-8000-000000000002',1,'08:00','20:00');
-- Francia off Tue..Thu of that week.
insert into public.staff_time_off (clinic_id, staff_id, start_date, end_date, reason)
select 'a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002', tue, thu, 'vacaciones' from d3;

-- ============ [A] anon ============
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$select 1 from public.staff_hours$$,    '42501', null, 'A1 anon cannot read staff_hours');
select throws_ok($$select 1 from public.staff_time_off$$, '42501', null, 'A2 anon cannot read staff_time_off');
select throws_ok($$select 1 from public.staff$$,          '42501', null, 'A3 anon cannot read staff');
select throws_ok($$select public._slot_problem('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',current_date,'10:00')$$,
  '42501', null, 'A4 anon cannot call internal _slot_problem');

-- list_therapists (spec test 2)
select results_eq($$select display_name from public.list_therapists('a0000000-0000-4000-8000-00000000000c')$$,
  array['Francia','Paulina'], 'L1 list_therapists: active therapists only, by sort_order (no admin, front desk, inactive)');
select is((select count(*)::int from public.list_therapists('b0000000-0000-4000-8000-00000000000c')), 1, 'L2 list_therapists is clinic-scoped');
select results_eq($$select count(*)::int from (select * from public.list_therapists('a0000000-0000-4000-8000-00000000000c') limit 1) x$$, array[1], 'L3 list_therapists returns rows');
select is((select count(*)::int from public.list_therapists('99999999-0000-4000-8000-00000000000c')), 0, 'L4 unknown clinic -> empty');

-- request_appointment: valid (test 3)
select lives_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',
  (select mon from d3),'10:00','Paciente','p@x.com','6861234567','initial','')$$, 'R1 valid request for Francia Mon 10:00');

-- rejects (tests 4–7)
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','b0000000-0000-4000-8000-000000000002',(select mon from d3),'11:00','P','p@x.com','','initial')$$,
  'P0001', 'inactive_staff', 'R2 therapist of another clinic rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000005',(select mon from d3),'11:00','P','p@x.com','','initial')$$,
  'P0001', 'inactive_staff', 'R3 inactive therapist rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000001',(select mon from d3),'11:00','P','p@x.com','','initial')$$,
  'P0001', 'inactive_staff', 'R4 admin (with hours) is not bookable');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000004',(select mon from d3),'11:00','P','p@x.com','','initial')$$,
  'P0001', 'inactive_staff', 'R5 front desk is not bookable');
select throws_ok($$select public.request_appointment('99999999-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3),'11:00','P','p@x.com','','initial')$$,
  'P0001', 'unknown_clinic', 'R6 unknown clinic rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3),'07:00','P','p@x.com','','initial')$$,
  'P0001', 'outside_hours', 'R7 before start rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3),'20:00','P','p@x.com','','initial')$$,
  'P0001', 'outside_hours', 'R8 slot ending after end_time rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3),'08:30','P','p@x.com','','initial')$$,
  'P0001', 'outside_hours', 'R9 off-grid time rejected (60-min slots)');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select sun from d3),'10:00','P','p@x.com','','initial')$$,
  'P0001', 'outside_hours', 'R10 Sunday (no hours) rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',(select mon from d3),'13:00','P','p@x.com','','initial')$$,
  'P0001', 'outside_hours', 'R11 split-shift gap rejected');
select lives_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',(select mon from d3),'15:00','P','p@x.com','','initial')$$,
  'R12 second shift start accepted');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select tue from d3),'10:00','P','p@x.com','','initial')$$,
  'P0001', 'time_off', 'R13 time off first day rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select wed from d3),'10:00','P','p@x.com','','initial')$$,
  'P0001', 'time_off', 'R14 time off middle day rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select thu from d3),'10:00','P','p@x.com','','initial')$$,
  'P0001', 'time_off', 'R15 time off last day rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select today from d3) - 1,'10:00','P','p@x.com','','initial')$$,
  'P0001', 'past_slot', 'R16 past date rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select today from d3),'00:00','P','p@x.com','','initial')$$,
  'P0001', 'past_slot', 'R17 today at a started time rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select today from d3) + 93,'10:00','P','p@x.com','','initial')$$,
  'P0001', 'too_far', 'R18 more than 92 days ahead rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3),'9:00','P','p@x.com','','initial')$$,
  'P0001', 'bad_time', 'R19 bad HH:MM rejected');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3),'10:00','Otro','o@x.com','','initial')$$,
  'P0001', 'slot_taken', 'R20 same therapist, same slot -> slot_taken');
select throws_ok($$select public.request_appointment('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3) + 7,'11:00','',  'p@x.com')$$,
  '23514', null, 'R21 field limits still enforced (empty name)');

-- get_taken_slots 4-arg (test 10)
select results_eq($$select slot_time from public.get_taken_slots('a0000000-0000-4000-8000-00000000000c',(select today from d3),(select today from d3)+30,'a0000000-0000-4000-8000-000000000002')$$,
  array['10:00'], 'T1 get_taken_slots(p_staff_id): only Francia''s booking');
select results_eq($$select slot_time from public.get_taken_slots('a0000000-0000-4000-8000-00000000000c',(select today from d3),(select today from d3)+30,'a0000000-0000-4000-8000-000000000003')$$,
  array['15:00'], 'T2 get_taken_slots(p_staff_id): only Paulina''s booking');

-- get_available_slots (test 10a)
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3)+7,(select mon from d3)+7)),
  12, 'V1 seeded Mon 08–20 -> 12 slots');
select results_eq($$select min(slot_time) || '-' || max(slot_time) from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3)+7,(select mon from d3)+7)$$,
  array['08:00-19:00'], 'V2 first 08:00, last 19:00');
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3),(select mon from d3))),
  11, 'V3 taken slot excluded');
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select tue from d3),(select thu from d3))),
  0, 'V4 time-off days have no slots');
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select sun from d3),(select sun from d3))),
  0, 'V5 Sunday has no slots');
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',(select mon from d3)+7,(select mon from d3)+7)),
  9, 'V6 split shift: 5 + 4 slots');
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000005',(select mon from d3),(select mon from d3)+7)),
  0, 'V7 inactive therapist -> none');
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000001',(select mon from d3),(select mon from d3)+7)),
  0, 'V8 admin -> none');
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select today from d3),(select today from d3)+93)),
  0, 'V9 oversized range -> none');
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select today from d3),(select today from d3))
           where slot_time::time <= public.clinic_now('a0000000-0000-4000-8000-00000000000c')::time),
  0, 'V10 no started slots today');

-- ============ [S] staff roles ============
reset role;
-- 30-minute sessions double the grid (test 10a)
update public.clinics set slot_minutes = 30 where id = 'a0000000-0000-4000-8000-00000000000c';
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',(select mon from d3)+7,(select mon from d3)+7)),
  24, 'V12 slot_minutes=30 -> 24 slots');
update public.clinics set slot_minutes = 60 where id = 'a0000000-0000-4000-8000-00000000000c';
select is((select count(*)::int from public.get_available_slots('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',(select mon from d3),(select mon from d3)+13) s
           where public._slot_problem('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',s.slot_date,s.slot_time) is not null),
  0, 'V11 parity: every available slot passes the request_appointment rule');
select is(pg_get_function_result('public.list_therapists(uuid)'::regprocedure), 'TABLE(id uuid, display_name text)', 'L5 list_therapists exposes id + display_name only');

-- therapist: reads hours, cannot write (test 13)
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a0000000-0000-4000-8000-000000000002"}', true);
select ok((select count(*) from public.staff_hours) > 0, 'S1 therapist reads own clinic hours');
select is((select count(*)::int from public.staff_hours where clinic_id = 'b0000000-0000-4000-8000-00000000000c'), 0, 'S2 therapist cannot read other clinic hours');
select throws_ok($$insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time) values ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',0,'08:00','12:00')$$,
  '42501', null, 'S3 therapist cannot add hours');
select throws_ok($$insert into public.staff_time_off (clinic_id, staff_id, start_date, end_date) values ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',current_date,current_date)$$,
  '42501', null, 'S4 therapist cannot add time off');
select is_empty($$update public.staff set display_name = 'x' where user_id = 'a0000000-0000-4000-8000-000000000002' returning 1$$, 'S5 therapist cannot rename self');

-- front desk: same (test 13)
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a0000000-0000-4000-8000-000000000004"}', true);
select throws_ok($$insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time) values ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000002',0,'08:00','12:00')$$,
  '42501', null, 'S6 front desk cannot add hours');
select is_empty($$delete from public.staff_time_off returning 1$$, 'S7 front desk cannot delete time off');
select is_empty($$update public.staff set active = false where user_id = 'a0000000-0000-4000-8000-000000000002' returning 1$$, 'S8 front desk cannot deactivate staff');

-- admin A: writes own clinic only (test 13)
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a0000000-0000-4000-8000-000000000001"}', true);
select lives_ok($$insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time) values ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',2,'09:00','14:00')$$,
  'S9 admin adds hours');
select lives_ok($$insert into public.staff_time_off (clinic_id, staff_id, start_date, end_date) values ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',current_date+40,current_date+41)$$,
  'S10 admin adds time off');
select isnt_empty($$update public.staff set display_name = 'Paulina R.', sort_order = 5, active = true where user_id = 'a0000000-0000-4000-8000-000000000003' returning 1$$,
  'S11 admin edits name/order/active');
select throws_ok($$insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time) values ('b0000000-0000-4000-8000-00000000000c','b0000000-0000-4000-8000-000000000002',2,'09:00','14:00')$$,
  '42501', null, 'S12 admin cannot add hours in another clinic');
select is_empty($$update public.staff set display_name = 'hack' where clinic_id = 'b0000000-0000-4000-8000-00000000000c' returning 1$$, 'S13 admin cannot edit other clinic staff');
select throws_ok($$insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time) values ('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000003',2,'14:00','09:00')$$,
  '23514', null, 'S14 end_time must be after start_time');
select throws_ok($$insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time) values ('a0000000-0000-4000-8000-00000000000c','b0000000-0000-4000-8000-000000000002',2,'09:00','14:00')$$,
  '23503', null, 'S15 hours cannot point at staff of another clinic');

-- ============ [X] lifecycle (test 14) ============
reset role;
update public.staff set active = false where user_id = 'a0000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.appointments where staff_id = 'a0000000-0000-4000-8000-000000000002' and status = 'pending'), 1,
  'X1 deactivating a therapist leaves bookings untouched');
select is((select count(*)::int from public.list_therapists('a0000000-0000-4000-8000-00000000000c')), 1, 'X2 deactivated therapist leaves the public list');
delete from public.staff where user_id = 'a0000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.staff_hours where staff_id = 'a0000000-0000-4000-8000-000000000002'), 0, 'X3 removing staff cascades hours');
select is((select count(*)::int from public.staff_time_off where staff_id = 'a0000000-0000-4000-8000-000000000002'), 0, 'X4 removing staff cascades time off');
select is((select count(*)::int from public.appointments where client_name = 'Paciente' and staff_id is null), 1, 'X5 removing staff keeps the booking, staff_id -> NULL');

select * from finish();
rollback;
