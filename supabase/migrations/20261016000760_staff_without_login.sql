-- 20261016000760_staff_without_login.sql (already applied on live 2026-10-16; committed for repo parity)
-- Lets a staff row exist with no Supabase Auth account (bookable therapist who never logs in).
-- Only blocker found: staff.user_id has FK -> auth.users(id). Everything else keys on
-- staff(user_id, clinic_id) and works with any uuid. We keep the column name (user_id = staff id)
-- to avoid touching the 3 composite FKs, RLS, RPCs and the app; a row with no auth user simply
-- never matches auth.uid(), so it can never log in or read anything.
-- Side effect: deleting an auth user no longer cascades to staff; the row stays (bookings keep it).
begin;
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.staff'::regclass and contype = 'f'
             and confrelid = 'auth.users'::regclass loop
    execute format('alter table public.staff drop constraint %I', c);
  end loop;
end $$;
alter table public.staff alter column user_id set default gen_random_uuid();
comment on column public.staff.user_id is
  'Staff id. Equals auth.users.id for members who log in; a random uuid for members without an account.';
commit;
