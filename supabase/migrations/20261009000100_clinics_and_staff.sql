-- PR 2 / 1 of 3: tenants and staff membership. Additive only: safe on the live project.

create table if not exists public.clinics (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique
               check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null check (length(name) between 1 and 120),
  timezone   text not null default 'America/Tijuana',
  created_at timestamptz not null default now()
);

create table if not exists public.staff (
  user_id    uuid not null references auth.users (id) on delete cascade,
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  role       text not null default 'therapist'
               check (role in ('admin', 'therapist', 'front_desk')),
  created_at timestamptz not null default now(),
  primary key (user_id, clinic_id)
);

create index if not exists staff_clinic_id_idx on public.staff (clinic_id);

-- Supabase grants new public tables to anon/authenticated by default; take that back.
revoke all on table public.clinics, public.staff from anon, authenticated;
grant select on table public.clinics, public.staff to authenticated;

alter table public.clinics enable row level security;
alter table public.staff   enable row level security;

-- Helpers. SECURITY DEFINER so policies can consult staff without RLS recursion;
-- empty search_path + schema-qualified names so they can't be hijacked.
create or replace function public.is_staff_of(p_clinic_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.clinic_id = p_clinic_id
      and s.user_id = (select auth.uid())
  );
$$;

create or replace function public.clinic_today(p_clinic_id uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select (now() at time zone c.timezone)::date
  from public.clinics c
  where c.id = p_clinic_id;
$$;

revoke execute on function public.is_staff_of(uuid)  from public, anon, authenticated;
revoke execute on function public.clinic_today(uuid) from public, anon, authenticated;
grant  execute on function public.is_staff_of(uuid)  to authenticated;
grant  execute on function public.clinic_today(uuid) to anon, authenticated;

drop policy if exists "Staff read their clinics" on public.clinics;
create policy "Staff read their clinics"
  on public.clinics for select to authenticated
  using (public.is_staff_of(id));

drop policy if exists "Staff read their clinic's staff" on public.staff;
create policy "Staff read their clinic's staff"
  on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff_of(clinic_id));

-- No insert/update/delete policies: clinics and staff are managed with the
-- service role (SQL editor / dashboard), never from the browser.
