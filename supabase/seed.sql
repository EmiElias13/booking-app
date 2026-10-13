-- Demo clinic for local development (`supabase db reset` runs this). Never run on production.
insert into public.clinics (id, slug, name, timezone)
values ('00000000-0000-4000-8000-000000000001', 'demo', 'Clínica Demo', 'America/Tijuana')
on conflict (id) do nothing;

-- Sample requests relative to "today" in the clinic's timezone so the demo never goes stale.
insert into public.appointments
  (clinic_id, client_name, email, phone, service, notes, slot_date, slot_time, status, staff_note)
select '00000000-0000-4000-8000-000000000001', v.client_name, v.email, '', v.service, v.notes,
       public.clinic_today('00000000-0000-4000-8000-000000000001') + v.day_offset, v.slot_time, v.status, v.staff_note
from (values
  ('Ana López',   'ana@ejemplo.com',   'initial',  'Dolor de espalda', 1, '09:00', 'pending',  ''),
  ('Luis Pérez',  'luis@ejemplo.com',  'followup', '',                 1, '11:00', 'approved', 'Te esperamos.'),
  ('Sofía Ruiz',  'sofia@ejemplo.com', 'sports',   'Rodilla',          2, '15:00', 'declined', 'Ese horario ya no está disponible.')
) as v(client_name, email, service, notes, day_offset, slot_time, status, staff_note)
where not exists (select 1 from public.appointments where clinic_id = '00000000-0000-4000-8000-000000000001');

-- Staff login: create the Auth user first (Studio → Authentication → Add user, e.g. equipo@demo.test),
-- then link it. Safe no-op if the user doesn't exist yet.
insert into public.staff (user_id, clinic_id, role)
select u.id, '00000000-0000-4000-8000-000000000001', 'admin'
from auth.users u
where u.email = 'equipo@demo.test'
on conflict do nothing;
