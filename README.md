# Clinic booking

One shared codebase (this repo) for the booking UI, one small deploy repo per clinic (copy `deploy-template/`), and one shared Supabase project.

Guests request a slot on `/`. Clinic staff sign in at `/login` and review requests on `/approvals`.

## Local development

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_CLINIC_ID`. Then:

```bash
npm install
npm run dev
```

**Demo mode** (no Supabase or clinic ID): in `.env.local` set `VITE_DEMO=true`, then `npm run dev`. Sign in with any email and password. Data stays in memory and is not saved.

## `clinic.config` fields

Branding and clinic-specific options live in `src/config/clinic.config.js`:

| Field | Purpose |
| --- | --- |
| `name` | Full clinic name (header, document title, logo alt) |
| `shortName` | Short label |
| `logo` | Path under `public/` for a logo image. Empty string shows a monogram from the first letter of `name` |
| `locale` | Locale for dates (e.g. `es-MX`) |
| `themeColor` | Browser theme color |
| `phonePlaceholder` | Placeholder on the booking phone field |
| `services` | `{ id, label }` options for the booking form |
| `timeSlots` | Bookable times (`HH:MM`) |
| `clinicId` | From `VITE_CLINIC_ID` (this clinic’s id in the shared clinics table) |

User-facing copy lives in `src/i18n/strings.js`. Interpolate with `t(template, vars)`.

## Adding a new clinic

1. Fill branding in `src/config/clinic.config.js` (name, logo, locale, theme, services, slots) and adjust copy in `src/i18n/strings.js` if needed.
2. Create a deploy repo from `deploy-template/` (copy `.github/workflows/deploy.yml` into that repo).
3. In the deploy repo, set Actions variable `CLINIC_ID` and secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon public key only, never `service_role`).
4. Settings → Pages → Source = GitHub Actions.
5. Add the custom domain and DNS records under Settings → Pages.
6. Add the Pages URL to Supabase Auth → URL Configuration → Redirect URLs.

The `@ref` on the workflow `uses:` line and `app_ref` must point at the same branch so the workflow and the code it builds always match. Until the template is merged to `main`, use `template/booking-app` for both.

If this `booking-app` repo is private, Settings → Actions → General → Access must allow the clinic deploy repos to use its workflows.

## Supabase schema

Coming in a later PR.
