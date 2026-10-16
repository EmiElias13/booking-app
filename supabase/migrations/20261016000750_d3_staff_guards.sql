-- D3 / PR 2 (#25, Equipo screen): staff guards. Runs after 20261016000700 on every environment,
-- including live. Additive: no data changes, existing rows untouched.
--   1. Roles are not changed through the API (Emiliano, 2026-10-16). Service role / SQL keeps setting
--      roles as before (that is how staff are set up today); admins still choose a role when adding staff.
--   2. A clinic always keeps at least one active admin: API callers cannot deactivate, delete, move or
--      demote the last one (otherwise nobody can open Equipo again).
--   3. A display name cannot be changed to blank. Enforced on change only: legacy rows created before
--      0700 have display_name = '' and must stay valid.
-- Why triggers and not `revoke update (role)`: a column revoke makes every API update that mentions
-- `role` fail with a permission error even on rows RLS already hides; the trigger only refuses an
-- actual role change, with a clear message.

create or replace function public.staff_edit_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role and current_setting('role', true) in ('authenticated','anon') then
    raise exception 'staff role cannot be changed from the app' using errcode = 'insufficient_privilege';
  end if;
  if new.display_name is distinct from old.display_name and btrim(new.display_name) = '' then
    raise exception 'staff display_name cannot be blank' using errcode = 'check_violation';
  end if;
  new.display_name := btrim(new.display_name);
  return new;
end $$;
revoke execute on function public.staff_edit_guard() from public, anon, authenticated;
drop trigger if exists staff_edit_guard on public.staff;
create trigger staff_edit_guard before update of role, display_name on public.staff
  for each row execute function public.staff_edit_guard();

-- security definer: must count admins regardless of the caller's RLS view.
create or replace function public.keep_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) not in ('authenticated','anon') then
    return coalesce(new, old);                       -- service role / SQL: setup and cleanup stay possible
  end if;
  if old.role <> 'admin' or not old.active then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.active and new.role = 'admin' and new.clinic_id = old.clinic_id then
    return new;                                      -- still an active admin of the same clinic
  end if;
  perform 1 from public.clinics where id = old.clinic_id for update;   -- serialize two admins removing each other
  if not exists (select 1 from public.staff s
                 where s.clinic_id = old.clinic_id and s.role = 'admin' and s.active
                   and s.user_id <> old.user_id) then
    raise exception 'last active admin of clinic % cannot be removed', old.clinic_id using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.keep_last_admin() from public, anon, authenticated;
drop trigger if exists keep_last_admin on public.staff;
create trigger keep_last_admin before update of active, role, clinic_id or delete on public.staff
  for each row execute function public.keep_last_admin();
