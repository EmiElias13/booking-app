-- D3 cleanup (QA on #29): therapists read only their OWN hours and time off.
-- Before: "Staff read hours" / "Staff read time off" used is_staff_of(clinic_id), so any therapist could
-- read every colleague's time off, including `reason` (staff-only free text). Admin and front desk still
-- read the whole clinic; writes stay admin-only (unchanged). Same shape as the 0800 appointments policy.
-- The Approvals page no longer selects `reason` at all (only the Team page does, and it is admin-only).
-- Rollback: supabase/rollback/rollback_1000.sql
begin;

drop policy if exists "Staff read hours" on public.staff_hours;
create policy "Staff read hours" on public.staff_hours for select to authenticated
  using (public.has_role(clinic_id, array['admin','front_desk'])
         or (public.has_role(clinic_id, array['therapist']) and staff_id = (select auth.uid())));

drop policy if exists "Staff read time off" on public.staff_time_off;
create policy "Staff read time off" on public.staff_time_off for select to authenticated
  using (public.has_role(clinic_id, array['admin','front_desk'])
         or (public.has_role(clinic_id, array['therapist']) and staff_id = (select auth.uid())));

commit;
