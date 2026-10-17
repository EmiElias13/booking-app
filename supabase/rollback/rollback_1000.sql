-- Rollback for 20261016001000_d3_time_off_read_scope.sql: any clinic staff reads all hours/time off again
-- (exact policies from 0700). One transaction; run in the SQL editor.
begin;
drop policy if exists "Staff read hours" on public.staff_hours;
create policy "Staff read hours" on public.staff_hours for select to authenticated
  using (public.is_staff_of(clinic_id));
drop policy if exists "Staff read time off" on public.staff_time_off;
create policy "Staff read time off" on public.staff_time_off for select to authenticated
  using (public.is_staff_of(clinic_id));
commit;
