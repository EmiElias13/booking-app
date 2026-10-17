-- Role scope (migration 20261016001000 + 0800): a therapist reads/updates only their own appointments,
-- hours and time off (incl. `reason`); front desk and admin see the whole clinic; clinic A never sees B.
-- pgTAP, rolls back. Locally: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/d3_role_scope_test.sql
begin;
select plan(30);

-- ============ fixtures (service role) ============
insert into auth.users (id, email) values
  ('d1000000-0000-4000-8000-000000000001','admin-s@test.local'),
  ('d1000000-0000-4000-8000-000000000002','desk-s@test.local'),
  ('d1000000-0000-4000-8000-000000000003','t1-s@test.local'),
  ('d1000000-0000-4000-8000-000000000004','t2-s@test.local'),
  ('d2000000-0000-4000-8000-000000000001','admin-t@test.local'),
  ('d2000000-0000-4000-8000-000000000002','t1-t@test.local');
insert into public.clinics (id, slug, name, plan) values
  ('d1000000-0000-4000-8000-00000000000c','scope-a','Scope A','clinica'),
  ('d2000000-0000-4000-8000-00000000000c','scope-b','Scope B','clinica');
insert into public.staff (user_id, clinic_id, role, display_name, active) values
  ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-00000000000c','admin','Admin A',true),
  ('d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-00000000000c','front_desk','Recepción A',true),
  ('d1000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-00000000000c','therapist','T1 A',true),
  ('d1000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-00000000000c','therapist','T2 A',true),
  ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000c','admin','Admin B',true),
  ('d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000c','therapist','T1 B',true);
insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time) values
  ('d1000000-0000-4000-8000-00000000000c','d1000000-0000-4000-8000-000000000003',1,'08:00','14:00'),
  ('d1000000-0000-4000-8000-00000000000c','d1000000-0000-4000-8000-000000000004',1,'08:00','14:00'),
  ('d2000000-0000-4000-8000-00000000000c','d2000000-0000-4000-8000-000000000002',1,'08:00','14:00');
insert into public.staff_time_off (clinic_id, staff_id, start_date, end_date, reason) values
  ('d1000000-0000-4000-8000-00000000000c','d1000000-0000-4000-8000-000000000003',current_date+30,current_date+31,'cita médica T1'),
  ('d1000000-0000-4000-8000-00000000000c','d1000000-0000-4000-8000-000000000004',current_date+30,current_date+31,'motivo privado T2'),
  ('d2000000-0000-4000-8000-00000000000c','d2000000-0000-4000-8000-000000000002',current_date+30,current_date+31,'motivo B');
insert into public.appointments (id, clinic_id, staff_id, client_name, email, service, slot_date, slot_time) values
  ('d1000000-0000-4000-8000-0000000000a1','d1000000-0000-4000-8000-00000000000c','d1000000-0000-4000-8000-000000000003','Paciente T1','p1@x.com','initial',current_date+3,'09:00'),
  ('d1000000-0000-4000-8000-0000000000a2','d1000000-0000-4000-8000-00000000000c','d1000000-0000-4000-8000-000000000004','Paciente T2','p2@x.com','initial',current_date+3,'09:00'),
  ('d2000000-0000-4000-8000-0000000000b1','d2000000-0000-4000-8000-00000000000c','d2000000-0000-4000-8000-000000000002','Paciente B','pb@x.com','initial',current_date+3,'09:00');

set local role authenticated;

-- ============ [T] therapist 1 of clinic A ============
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000003"}',true);
select results_eq($$select client_name from public.appointments order by 1$$, array['Paciente T1'], 'T1 therapist reads only own appointments');
select results_eq($$select staff_id from public.staff_hours$$, array['d1000000-0000-4000-8000-000000000003'::uuid], 'T2 therapist reads only own hours');
select results_eq($$select reason from public.staff_time_off$$, array['cita médica T1'], 'T3 therapist reads only own time off');
select is_empty($$select 1 from public.staff_time_off where reason = 'motivo privado T2'$$, 'T4 therapist cannot read a colleague''s time-off reason');
select is_empty($$select 1 from public.staff_time_off where staff_id = 'd1000000-0000-4000-8000-000000000004'$$, 'T5 therapist cannot read a colleague''s time-off rows');
select results_eq($$update public.appointments set staff_note = 'ok' where id = 'd1000000-0000-4000-8000-0000000000a1' returning id$$,
  array['d1000000-0000-4000-8000-0000000000a1'::uuid], 'T6 therapist updates own appointment');
select is_empty($$update public.appointments set staff_note = 'x' where id = 'd1000000-0000-4000-8000-0000000000a2' returning 1$$, 'T7 therapist cannot update a colleague''s appointment');
select is_empty($$update public.staff_hours set end_time = '15:00' where staff_id = 'd1000000-0000-4000-8000-000000000004' returning 1$$, 'T8 therapist cannot update a colleague''s hours');
select is_empty($$update public.staff_time_off set reason = 'x' where staff_id = 'd1000000-0000-4000-8000-000000000004' returning 1$$, 'T9 therapist cannot update a colleague''s time off');
-- Hours and time off are admin-managed (Team page): a therapist cannot edit even their own.
select is_empty($$update public.staff_hours set end_time = '15:00' where staff_id = 'd1000000-0000-4000-8000-000000000003' returning 1$$, 'T10 therapist cannot edit own hours (admin-only)');
select is_empty($$update public.staff_time_off set reason = 'x' where staff_id = 'd1000000-0000-4000-8000-000000000003' returning 1$$, 'T11 therapist cannot edit own time off (admin-only)');
select is_empty($$delete from public.staff_time_off where staff_id = 'd1000000-0000-4000-8000-000000000004' returning 1$$, 'T12 therapist cannot delete a colleague''s time off');
select is_empty($$select 1 from public.appointments where clinic_id = 'd2000000-0000-4000-8000-00000000000c'$$, 'T13 therapist sees nothing of clinic B');

-- ============ [F] front desk of clinic A ============
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000002"}',true);
select results_eq($$select client_name from public.appointments order by 1$$, array['Paciente T1','Paciente T2'], 'F1 front desk reads all clinic A appointments');
select is((select count(*)::int from public.staff_hours), 2, 'F2 front desk reads all clinic A hours');
select is((select count(*)::int from public.staff_time_off), 2, 'F3 front desk reads all clinic A time off');
select results_eq($$update public.appointments set staff_note = 'desk' where id = 'd1000000-0000-4000-8000-0000000000a2' returning id$$,
  array['d1000000-0000-4000-8000-0000000000a2'::uuid], 'F4 front desk updates any clinic A appointment');
select is_empty($$update public.appointments set staff_note = 'x' where id = 'd2000000-0000-4000-8000-0000000000b1' returning 1$$, 'F5 front desk cannot update clinic B appointments');

-- ============ [A] admin of clinic A ============
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000001"}',true);
select is((select count(*)::int from public.appointments), 2, 'A1 admin reads all clinic A appointments');
select is((select count(*)::int from public.staff_hours), 2, 'A2 admin reads all clinic A hours');
select results_eq($$select reason from public.staff_time_off order by 1$$, array['cita médica T1','motivo privado T2'], 'A3 admin reads all clinic A time off with reason');
select is((select count(*)::int from public.staff_hours where staff_id = 'd1000000-0000-4000-8000-000000000004'), 1, 'A4 admin reads a therapist''s hours');
select results_eq($$update public.staff_time_off set reason = 'editado' where staff_id = 'd1000000-0000-4000-8000-000000000004' returning reason$$,
  array['editado'], 'A5 admin edits time off in own clinic');

-- ============ [X] clinic isolation ============
select is_empty($$select 1 from public.appointments where clinic_id = 'd2000000-0000-4000-8000-00000000000c'$$, 'X1 clinic A admin sees no clinic B appointments');
select is_empty($$select 1 from public.staff_hours where clinic_id = 'd2000000-0000-4000-8000-00000000000c'$$, 'X2 clinic A admin sees no clinic B hours');
select is_empty($$select 1 from public.staff_time_off where clinic_id = 'd2000000-0000-4000-8000-00000000000c'$$, 'X3 clinic A admin sees no clinic B time off');
select is_empty($$update public.staff_time_off set reason = 'x' where clinic_id = 'd2000000-0000-4000-8000-00000000000c' returning 1$$, 'X4 clinic A admin cannot edit clinic B time off');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d2000000-0000-4000-8000-000000000002"}',true);
select results_eq($$select client_name from public.appointments$$, array['Paciente B'], 'X5 clinic B therapist sees only own clinic B appointment');
select results_eq($$select reason from public.staff_time_off$$, array['motivo B'], 'X6 clinic B therapist sees only own time off');
select is_empty($$select 1 from public.staff_hours where clinic_id = 'd1000000-0000-4000-8000-00000000000c'$$, 'X7 clinic B therapist sees no clinic A hours');

reset role;
select * from finish();
rollback;
