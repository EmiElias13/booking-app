-- D3 / PR 6: cleanup after the cutover (spec §6 "0900"). Run after 20261016000800.
-- Drops the clinic-wide 3-arg get_taken_slots (pre-D3 guest picker). The per-therapist 4-arg version
-- (0700) and get_available_slots stay. No data changes. Idempotent.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'appointments_active_slot'
                 and indexdef like '%(clinic_id, staff_id, slot_date, slot_time)%') then
    raise exception 'D3 0900: run 20261016000800 (cutover) first. Nothing was changed.';
  end if;
end $$;

drop function if exists public.get_taken_slots(uuid, date, date);
