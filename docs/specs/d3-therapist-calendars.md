# D3: Per-therapist calendars (spec)

Status: draft for Emiliano · Author: Lead · Date: 2026-10-16 · Repo: EmiEliasDev/booking-app (read from `main` @ 6036995)
Scope: spec only. No branch, commit or PR without Emiliano's explicit go.

## 1. Decisions (Oct 16)
1. Only **admin** sets therapist hours and time off.
2. One session length per clinic for now (per-therapist later, after the clinic meeting).
3. Patient **always picks a therapist**; no "Cualquier fisioterapeuta".
4. Bookings stay `pending` until approved by staff (who exactly: decision 6).
5. Therapists see only their own appointments; admin and front_desk see the whole clinic.
6. Therapists approve/decline only their own bookings; admin and front_desk approve any in the clinic.
7. Admins can NOT be bookable. Bookable = `active and role = 'therapist'` (no extra flag; role stays single-valued).
8. Time off is whole days only; no partial-day blocks.
9. Legacy bookings with `staff_id null` go to the first therapist on the list. Rehabireb order: Francia, Paulina, Manganita, Mariano → Francia gets them in the data step before 0800.
10. Slots are generated from each therapist's own `staff_hours` in steps of `clinics.slot_minutes` (from each range's `start_time`; last slot must end by `end_time`). The build-config `timeSlots` list is retired.
11. Seed hours for Francia, Paulina, Manganita, Mariano: Mon–Sat 08:00–20:00 (60-min slots → 08:00…19:00, 12 per day). Note: this drops today's 13:00 lunch gap and adds 18:00/19:00; the admin can split shifts later in Equipo.
12. Bookings hit by deactivation or new time off are left untouched; staff handle them. Approvals shows a "needs attention" flag (cheap: computed client-side from data staff can already read).
13. The patient confirmation shows the therapist's name.

## 2. Current schema (what we build on)
- `staff(user_id, clinic_id, role in admin|therapist|front_desk, created_at)`, PK `(user_id, clinic_id)`; staff-limit trigger (3 Básico / 6 Clínica).
- `appointments(..., clinic_id not null, staff_id uuid null, slot_date date, slot_time text 'HH:MM', status pending|approved|declined, staff_note)`; composite FK `(staff_id, clinic_id) → staff` `on delete set null (staff_id)`.
- Unique index `appointments_active_slot (clinic_id, slot_date, slot_time) where status <> 'declined'`.
- Anon: column-level `insert` grant + policy "Guests request pending appointments" (0600: `staff_id is null`, not in past via `clinic_today`/`clinic_now`).
- Staff RLS: select/update via `is_staff_of(clinic_id)` (all roles see all). Helpers `has_role`, `is_staff_of`, `clinic_today`, `clinic_now`, `get_taken_slots(uuid,date,date)`.
- Slot grid comes from build config `timeSlots` (`08:00…17:00` hourly, no 13:00) via `TIME_SLOTS` in `src/data/clinic.js`, used by `Home.jsx` (first-open-day search, picker). Retired by decision 10. Guest allowlist in `src/lib/supabase.js`: `POST /rpc/get_taken_slots`, `/rpc/clinic_today`, `/appointments`.

## 3. Schema changes
```sql
-- staff
alter table public.staff
  add column display_name text not null default '' check (length(display_name) <= 80),
  add column active boolean not null default true,
  add column sort_order smallint not null default 0;       -- list order shown to patients
grant update (role, display_name, active, sort_order) on public.staff to authenticated;   -- admin-only via existing policy

-- clinic session length (one per clinic, decision 2)
alter table public.clinics add column slot_minutes int not null default 60 check (slot_minutes between 10 and 240);

-- weekly hours: several rows per weekday allowed (split shifts, e.g. 08-13 and 15-19)
create table public.staff_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null, staff_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Sunday (extract(dow))
  start_time time not null, end_time time not null check (end_time > start_time),
  foreign key (staff_id, clinic_id) references public.staff (user_id, clinic_id) on delete cascade
);
create index on public.staff_hours (clinic_id, staff_id, weekday);
-- (optional) exclusion constraint against overlapping ranges per staff/weekday

-- time off: inclusive date range, whole days only (decision 8)
create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null, staff_id uuid not null,
  start_date date not null, end_date date not null check (end_date >= start_date),
  reason text not null default '' check (length(reason) <= 200),   -- staff-only, never public
  foreign key (staff_id, clinic_id) references public.staff (user_id, clinic_id) on delete cascade
);
create index on public.staff_time_off (clinic_id, staff_id, start_date);

-- one active booking per therapist per slot
drop index public.appointments_active_slot;
create unique index appointments_active_slot
  on public.appointments (clinic_id, staff_id, slot_date, slot_time) where status <> 'declined';
```
Note: legacy rows have `staff_id null` and NULLs don't collide in a unique index; the data step assigns them all to Francia and the 0800 pre-check aborts if any remain (§6).

## 4. RPCs
### `request_appointment(...)` – security definer, `search_path = ''`, `grant execute to anon, authenticated`
Args: `p_clinic_id, p_staff_id, p_slot_date, p_slot_time text, p_client_name, p_email, p_phone, p_service, p_notes`. Returns `uuid` (appointment id) only.
Checks, in order (each raises a distinct `errcode`/message the UI maps to a string):
1. `p_staff_id` is in `staff` for `p_clinic_id`, `active` and `role = 'therapist'` (admins and front_desk rejected).
2. `p_slot_time` matches `HH:MM`; slot is in the future: `date > clinic_today` or (`= clinic_today` and `time > clinic_now::time`); date ≤ today + 92.
3. Within hours and on the grid: exists `staff_hours` row with `weekday = extract(dow from p_slot_date)`, `start_time <= t`, `t + slot_minutes <= end_time`, and `(t - start_time)` a multiple of `slot_minutes`.
4. Not in `staff_time_off` (`p_slot_date between start_date and end_date`).
5. Free: `insert ... status 'pending', staff_note ''`; unique-violation → `slot_taken`. Field-length checks come from existing constraints.
Lock: rely on the unique index (no advisory lock needed).

### `get_available_slots(p_clinic_id, p_staff_id, p_from, p_to)` – security definer, anon + authenticated
Server-side slot generation (decision 10): for each date in range (max 92 days, from `clinic_today`), expand the therapist's `staff_hours` rows for that weekday with `generate_series(start_time, end_time - slot_minutes, slot_minutes)`; drop time-off days, past times today (`clinic_now`), and taken slots. Returns `(slot_date date, slot_time text)` only, so hours and time off are never exposed. Empty for inactive/non-therapist staff. Uses the same predicates as `request_appointment` (shared internal helper `_is_bookable_slot` so they can't drift).

### `get_taken_slots(p_clinic_id, p_from, p_to, p_staff_id uuid)`
Same as today plus `and a.staff_id = p_staff_id`. Kept for parity/staff use; the guest picker uses `get_available_slots`. Keep the old 3-arg signature until the new frontend is live (drop in 0900).

### `list_therapists(p_clinic_id)` – security definer, anon + authenticated
`returns table (id uuid, display_name text)` where `active and role = 'therapist'`, ordered by `sort_order, display_name`. No email, role or user metadata.

## 5. RLS by role
| Table / action | anon | therapist | front_desk | admin |
|---|---|---|---|---|
| appointments insert | **none** (policy dropped, grant revoked) → RPC only | none (RPC) | none (RPC) | none (RPC) |
| appointments select | none | `staff_id = auth.uid()` | whole clinic* | whole clinic* |
| appointments update (status, staff_note) | none | own only (approve/decline) | whole clinic* | whole clinic* |
| staff select | none (use `list_therapists`) | own clinic (unchanged) | same | same |
| staff insert/update/delete | none | none | none | admin (unchanged) |
| staff_hours / staff_time_off select | none | own clinic | own clinic | own clinic |
| staff_hours / staff_time_off write | none | none | none | `has_role(clinic_id, '{admin}')` |
\* Confirmed (decisions 5–6).

Policies (replace 0300 "Staff read/decide their clinic's appointments"):
```sql
using ( public.has_role(clinic_id, array['admin','front_desk'])
     or (public.has_role(clinic_id, array['therapist']) and staff_id = (select auth.uid())) )
```
Legacy `staff_id is null` rows: none after the data step; 0800 pre-check aborts if any remain. Grants: `revoke all on staff_hours, staff_time_off from anon; grant select, insert, update, delete ... to authenticated`.

## 6. Migration plan (live-safe)
Files `20261016000700…` onward, one concern each:
- **0700 additive** (safe anytime, old app keeps working): staff columns, `clinics.slot_minutes`, `staff_hours`, `staff_time_off` + RLS, `list_therapists`, `request_appointment`, `get_available_slots`, 4-arg `get_taken_slots`. Old anon insert path untouched.
- **Data step (manual, service role):** set `display_name` for Rehabireb staff; seed `staff_hours` Mon–Sat (weekday 1–6) 08:00–20:00 for Francia, Paulina, Manganita and Mariano (`slot_minutes` stays 60); set `sort_order` Francia 1, Paulina 2, Manganita 3, Mariano 4 (all role `therapist`, active); assign every legacy `staff_id null` row to the first therapist by `sort_order` (Francia): `update appointments set staff_id = <francia> where clinic_id = <rehabireb> and staff_id is null;` Run a duplicate check first (two legacy rows can't share a slot today, so none expected).
- **Deploy frontend** that uses `list_therapists` + `request_appointment` (manual re-run of the Rehabireb deploy repo).
- **0800 breaking cutover** (only after the new bundle is live and QA'd; aborts if any `staff_id is null` row remains): drop anon insert policy, `revoke insert on appointments from anon`; swap unique index (pre-check: abort if duplicates would exist, list ids); replace staff select/update policies (therapist own-only). Remove `/appointments` POST from the guest allowlist.
- **0900 cleanup:** drop 3-arg `get_taken_slots`.

Live-safety: run 0700 in the SQL editor, verify, then 0800 in a quiet hour (after 20:00 PT, when bookable hours end). Index swap is a small table: `create unique index concurrently` new name first, then drop old, then rename (no write lock window). Each file is idempotent (`if not exists`, `drop policy if exists`).
Rollback:
- 0800 → `rollback_0800.sql`: recreate 0600 anon insert policy + column grant, restore `(clinic_id, slot_date, slot_time)` index (fails if two therapists now share a slot – then keep new index), restore `is_staff_of` policies. Redeploy previous bundle.
- 0700 → drop new functions/tables/columns (only if no admin data entered; otherwise leave, it's inert).

## 7. UI touchpoints
- **Home (guest):** step "Elige fisioterapeuta" before the date picker (cards or select, names only; required, no "any" option). Picker shows only `get_available_slots` results (D1 "hide them"); first-open-day = first date in that result within 14 days. Replace all `TIME_SLOTS` use in `Home.jsx`; the client-side "already started today" filter becomes redundant (server does it) but can stay as a guard. Confirmation screen shows the therapist's name (decision 13; from the picker's `list_therapists` data, no extra call). Submit via `/rpc/request_appointment`; map errors (`slot_taken`, `outside_hours`, `time_off`, `past_slot`, `inactive_staff`) to `strings`. Empty state if clinic has no active therapists.
- **Approvals (staff):** therapist column/filter for admin/front_desk; therapists see only theirs (RLS does it). Show therapist on each card. "Revisar" badge on pending/approved future bookings whose therapist is inactive, or whose date falls in their time off, or whose time is outside their hours (client-side from `staff`, `staff_hours`, `staff_time_off`; no schema change). No auto-action (decision 12).
- **Admin › Equipo (new, admin only, `RequireStaff` role check):** per staff member: display name, active toggle, order (therapists only), weekly hours editor (rows per weekday, add split shift, copy to all days), time-off list (date range + reason). UI/UX to spec layout; 360px width.
- Retire `timeSlots` from `clinic.config.js` defaults and per-clinic overrides, and `TIME_SLOTS` from `src/data/clinic.js` (deploy repos that override `timeSlots` just get it ignored; remove there later).
- `src/lib/supabase.js` allowlist: guest `+ /rpc/request_appointment, /rpc/list_therapists, /rpc/get_available_slots`, `- POST /appointments` (after 0800); staff `+ /staff_hours, /staff_time_off` (GET/POST/PATCH/DELETE), `PATCH /staff`.
- `src/demo/api.js` / `src/store/appointments.jsx`: mirror new calls; demo mode generates slots from fake therapist hours instead of `TIME_SLOTS`.
- Frontend tests: any test that relies on `TIME_SLOTS`/config `timeSlots` (first-open-day, past-slot hiding, N1–N3/P16–P17 from PR #21) must switch to mocked `get_available_slots` responses; add tests for therapist required, confirmation shows name, Approvals flag.

## 8. pgTAP tests (supabase/tests/d3_therapist_calendars_test.sql)
1. anon cannot `insert` into appointments (after 0800); anon cannot select staff_hours/time_off/staff.
2. `list_therapists` returns only id + display_name, only active therapists (excl. admin, front_desk, inactive), ordered by sort_order, only that clinic.
3. `request_appointment` OK for valid slot → row `pending`, `staff_id` set, `staff_note ''`.
4. rejects: therapist of another clinic; inactive; admin or front_desk staff_id; unknown clinic.
5. rejects: outside hours; last slot ending after `end_time`; off-grid time (e.g. 08:30 with 60-min slots); wrong weekday (Sunday for seeded staff); split-shift gap.
6. rejects: date inside time off (start, middle, end day).
7. rejects: past date; today with time ≤ `clinic_now`; > 92 days; bad `HH:MM`.
8. same slot, same therapist twice → `slot_taken`; same slot, different therapist → OK.
9. declined booking frees the slot.
10. `get_taken_slots` with `p_staff_id` returns only that therapist's slots, no PII.
10a. `get_available_slots`: seeded Mon–Sat 08–20 yields 08:00…19:00 (12) on a weekday, none on Sunday, none on time-off days, excludes taken and past-today slots; changing `slot_minutes` to 30 yields 24; empty for inactive or admin staff_id; every returned slot is accepted by `request_appointment` (parity).
11. therapist A sees/approves only own appointments; cannot see or approve therapist B's; cannot update staff_id.
12. front_desk and admin see/update all clinic appointments; none across clinics.
13. only admin writes staff_hours/time_off/staff.display_name/active/sort_order; therapist/front_desk denied; cross-clinic admin denied.
14. removing a staff member cascades hours/time off and nulls `appointments.staff_id`; deactivating or adding time off leaves existing bookings untouched.
14a. 0800 pre-check aborts when a `staff_id null` row exists.
15. existing isolation + tiers tests still pass (update the `staff_id is null` assertions).

## 9. PR breakdown (each needs Emiliano's go)
1. `feature/d3-schema` – migration 0700 + pgTAP 2–10a, 13–14 (additive, safe on live).
2. `feature/d3-admin-team` – Admin › Equipo screen (hours, time off, name, active).
3. `feature/d3-guest-picker` – therapist picker, `get_available_slots`, RPC booking, retire `timeSlots`/`TIME_SLOTS`, confirmation name, allowlist, strings, demo api, frontend test rewrite.
4. `feature/d3-approvals-scope` – therapist filter/label + "Revisar" flag on Approvals.
5. `feature/d3-cutover` – migration 0800 + rollback file + tests 1, 11–12, 14a, 15; allowlist removal. Merge only after 2–4 are live and QA'd.
6. `feature/d3-cleanup` – 0900.

## 10. Open questions
None blocking. Minor, can be settled during PR review:
1. Clinic-level closures (holidays) are entered as time off per therapist for now; a clinic-wide closed-days table is later work if it becomes tedious.
