-- PR 2 / 2 of 3: add the tenant column, nullable for now. Additive only: safe on the live project.

alter table public.appointments
  add column if not exists clinic_id uuid references public.clinics (id) on delete restrict;

create index if not exists appointments_clinic_slot_idx
  on public.appointments (clinic_id, slot_date, slot_time);
