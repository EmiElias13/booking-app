# Clinic booking

Clinic appointment booking UI. The React app talks to a Supabase table over HTTP — no backend server.

Guests book with the anon key. Clinic staff sign in to review requests. Clinic name, services, and colors live in `src/config/clinic.config.js`. User-facing copy lives in `src/i18n/strings.js`.

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. Run `supabase/schema.sql` in the project's SQL editor.
3. Create an Auth user for clinic staff (Authentication → Users → Add user).
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Settings → API).
5. Install and start the app:

```bash
npm install
npm run dev
```

Guests request slots on `/`. Staff sign in at `/login` to review them on `/approvals`.
