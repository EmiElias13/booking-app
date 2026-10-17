-- Migration 20261016001000 only narrows what therapists READ in staff_hours/staff_time_off. Guest (anon)
-- and front desk slot lookups (list_therapists, get_available_slots) must return exactly the same rows
-- with the pre-1000 policies (0700/0900 state, = rollback_1000.sql) and with the 1000 policies.
-- pgTAP, rolls back. Run after all migrations.
-- Locally: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/d3_slots_unchanged_by_1000_test.sql
begin;
select plan(9);

-- ============ fixtures (service role) ============
insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001','admin-u@test.local'),
  ('e1000000-0000-4000-8000-000000000002','desk-u@test.local'),
  ('e1000000-0000-4000-8000-000000000003','t1-u@test.local'),
  ('e1000000-0000-4000-8000-000000000004','t2-u@test.local');
insert into public.clinics (id, slug, name, plan) values
  ('e1000000-0000-4000-8000-00000000000c','slots-u','Slots U','clinica');
insert into public.staff (user_id, clinic_id, role, display_name, active, sort_order) values
  ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-00000000000c','admin','Admin U',true,0),
  ('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-00000000000c','front_desk','Recepción U',true,0),
  ('e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-00000000000c','therapist','T1 U',true,1),
  ('e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-00000000000c','therapist','T2 U',true,2);
-- Every weekday: T1 mornings, T2 split shift. T2 is off days +3..+4. One booking each takes a slot.
insert into public.staff_hours (clinic_id, staff_id, weekday, start_time, end_time)
select 'e1000000-0000-4000-8000-00000000000c', s, d, st::time, en::time
from generate_series(0,6) d,
     (values ('e1000000-0000-4000-8000-000000000003'::uuid,'08:00','12:00'),
             ('e1000000-0000-4000-8000-000000000004'::uuid,'09:00','11:00'),
             ('e1000000-0000-4000-8000-000000000004'::uuid,'15:00','18:00')) h(s, st, en);
insert into public.staff_time_off (clinic_id, staff_id, start_date, end_date, reason) values
  ('e1000000-0000-4000-8000-00000000000c','e1000000-0000-4000-8000-000000000004',
   public.clinic_today('e1000000-0000-4000-8000-00000000000c')+3, public.clinic_today('e1000000-0000-4000-8000-00000000000c')+4, 'privado');
insert into public.appointments (clinic_id, staff_id, client_name, email, service, slot_date, slot_time) values
  ('e1000000-0000-4000-8000-00000000000c','e1000000-0000-4000-8000-000000000003','Fake 1','f1@x.com','initial',public.clinic_today('e1000000-0000-4000-8000-00000000000c')+2,'09:00'),
  ('e1000000-0000-4000-8000-00000000000c','e1000000-0000-4000-8000-000000000004','Fake 2','f2@x.com','initial',public.clinic_today('e1000000-0000-4000-8000-00000000000c')+5,'16:00');

create temp table snap (phase text, who text, kind text, staff_id uuid, slot_date date, slot_time text);
grant insert, select on snap to anon, authenticated;

-- Captures list_therapists + get_available_slots (both therapists, days +1..+10) as anon and front desk.
create function pg_temp.capture(p_phase text) returns void language plpgsql as $$
declare
  v_clinic uuid := 'e1000000-0000-4000-8000-00000000000c';
  v_today  date := public.clinic_today('e1000000-0000-4000-8000-00000000000c');
  v_who    text;
begin
  foreach v_who in array array['anon','front_desk'] loop
    if v_who = 'anon' then
      perform set_config('request.jwt.claims','{"role":"anon"}',true);
      set local role anon;
    else
      perform set_config('request.jwt.claims','{"role":"authenticated","sub":"e1000000-0000-4000-8000-000000000002"}',true);
      set local role authenticated;
    end if;
    insert into snap select p_phase, v_who, 'therapist', t.id, null, t.display_name from public.list_therapists(v_clinic) t;
    insert into snap select p_phase, v_who, 'slot', s.id, a.slot_date, a.slot_time
      from (values ('e1000000-0000-4000-8000-000000000003'::uuid), ('e1000000-0000-4000-8000-000000000004'::uuid)) s(id),
           public.get_available_slots(v_clinic, s.id, v_today + 1, v_today + 10) a;
    reset role;
  end loop;
end $$;

-- Sanity: the 1000 policy is what's installed now.
select ok((select qual from pg_policies where tablename = 'staff_time_off' and policyname = 'Staff read time off') like '%front_desk%',
  'S1 migration 1000 policy is installed');

-- ============ after 1000 (current) ============
select pg_temp.capture('after');

-- ============ before 1000: swap to the 0700 policies (same bodies as rollback_1000.sql) ============
drop policy "Staff read hours" on public.staff_hours;
create policy "Staff read hours" on public.staff_hours for select to authenticated using (public.is_staff_of(clinic_id));
drop policy "Staff read time off" on public.staff_time_off;
create policy "Staff read time off" on public.staff_time_off for select to authenticated using (public.is_staff_of(clinic_id));
select pg_temp.capture('before');

-- ============ compare ============
select ok((select count(*) from snap where phase = 'after' and who = 'anon' and kind = 'slot') > 20, 'S2 fixtures produce real slots');
select ok(exists (select 1 from snap where phase = 'after' and kind = 'slot' and staff_id = 'e1000000-0000-4000-8000-000000000003'
                  and slot_date = public.clinic_today('e1000000-0000-4000-8000-00000000000c') + 2 and slot_time = '08:00')
          and not exists (select 1 from snap where kind = 'slot' and staff_id = 'e1000000-0000-4000-8000-000000000003'
                  and slot_date = public.clinic_today('e1000000-0000-4000-8000-00000000000c') + 2 and slot_time = '09:00'),
  'S3 booked slot is excluded, neighbours offered');
select is_empty($$select 1 from snap where kind = 'slot' and staff_id = 'e1000000-0000-4000-8000-000000000004'
                  and slot_date between public.clinic_today('e1000000-0000-4000-8000-00000000000c') + 3 and public.clinic_today('e1000000-0000-4000-8000-00000000000c') + 4$$,
  'S4 time-off days are excluded');
select set_eq($$select kind, staff_id, slot_date, slot_time from snap where phase = 'before' and who = 'anon'$$,
              $$select kind, staff_id, slot_date, slot_time from snap where phase = 'after'  and who = 'anon'$$,
  'S5 anon: identical therapists and slots before/after 1000');
select set_eq($$select kind, staff_id, slot_date, slot_time from snap where phase = 'before' and who = 'front_desk'$$,
              $$select kind, staff_id, slot_date, slot_time from snap where phase = 'after'  and who = 'front_desk'$$,
  'S6 front desk: identical therapists and slots before/after 1000');
select is((select count(*) from snap where phase = 'before'), (select count(*) from snap where phase = 'after'), 'S7 same row counts (no duplicates lost)');
select set_eq($$select kind, staff_id, slot_date, slot_time from snap where phase = 'after' and who = 'anon'$$,
              $$select kind, staff_id, slot_date, slot_time from snap where phase = 'after' and who = 'front_desk'$$,
  'S8 anon and front desk see the same slots');
select is((select count(*)::int from snap where phase = 'after' and who = 'anon' and kind = 'therapist'), 2, 'S9 both therapists listed');

select * from finish();
rollback;
