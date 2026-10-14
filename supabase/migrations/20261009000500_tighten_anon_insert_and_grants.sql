-- Carries two tightenings from the fresh live setup (fresh_setup.sql) into the repo migrations.
-- (a) Guests cannot assign a staff member to their own booking.
drop policy if exists "Guests request pending appointments" on public.appointments;
create policy "Guests request pending appointments" on public.appointments for insert to anon
  with check (status = 'pending' and staff_note = '' and staff_id is null
              and slot_date >= public.clinic_today(clinic_id));

-- (b) enforce_staff_limit() is a trigger function only the database calls.
revoke execute on function public.enforce_staff_limit() from public, anon, authenticated;
