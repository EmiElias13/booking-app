-- PR 2 / 4: plans and staff limits, role-based access, staff assignment on appointments.
-- Roles: all roles see and approve/decline every appointment in their own clinic;
-- only admin manages staff. Nobody deletes appointments or clinics.
-- Plan/limit changes are service-role only. On downgrade, existing staff stay; only new staff are blocked.
alter table public.clinics
  add column plan text not null default 'basico' check (plan in ('basico','clinica')),
  -- NULL = follow the plan (basico 3, clinica 6); non-NULL = per-clinic override for custom deals
  add column staff_limit int check (staff_limit > 0);


create or replace function public.clinic_staff_limit(p_clinic_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(c.staff_limit, case c.plan when 'clinica' then 6 else 3 end)
  from public.clinics c where c.id = p_clinic_id;
$$;

-- Downgrade: existing staff stay; new inserts/moves are blocked while count >= limit.
create or replace function public.enforce_staff_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int; n int;
begin
  -- BEFORE triggers run before RLS WITH CHECK: refuse non-admins first so the limit error
  -- doesn't leak another clinic's limit/headcount (QA finding).
  if current_setting('role', true) in ('authenticated','anon') and not public.has_role(new.clinic_id, array['admin']) then
    raise exception 'new row violates row-level security policy for table "staff"' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.clinics where id = new.clinic_id for update;   -- serialize concurrent inserts
  lim := public.clinic_staff_limit(new.clinic_id);
  select count(*) into n from public.staff where clinic_id = new.clinic_id;
  if n >= lim then
    raise exception 'staff limit (%) reached for clinic %', lim, new.clinic_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger staff_limit before insert or update of clinic_id on public.staff
  for each row execute function public.enforce_staff_limit();

create or replace function public.has_role(p_clinic_id uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.clinic_id = p_clinic_id
    and s.user_id = (select auth.uid()) and s.role = any (p_roles));
$$;
revoke execute on function public.has_role(uuid, text[]) from public, anon, authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;
revoke execute on function public.clinic_staff_limit(uuid) from public, anon;
grant execute on function public.clinic_staff_limit(uuid) to authenticated;

-- Composite FK = staff_id must be staff of the SAME clinic. Removing staff keeps the appointment.
alter table public.appointments add column staff_id uuid,
  add constraint appointments_staff_fk foreign key (staff_id, clinic_id)
    references public.staff (user_id, clinic_id) on delete set null (staff_id);

-- Appointments: every role (admin, therapist, front_desk) reads and decides all of its own clinic's
-- appointments. The 0300 policies ("Staff read/decide their clinic's appointments", is_staff_of) stay as-is.

-- Staff management: admin of that clinic only.
grant insert, delete on table public.staff to authenticated;
grant update (role) on table public.staff to authenticated;
create policy "Admin adds staff" on public.staff for insert to authenticated
  with check (public.has_role(clinic_id, array['admin']));
create policy "Admin edits staff" on public.staff for update to authenticated
  using (public.has_role(clinic_id, array['admin'])) with check (public.has_role(clinic_id, array['admin']));
create policy "Admin removes staff" on public.staff for delete to authenticated
  using (public.has_role(clinic_id, array['admin']));
