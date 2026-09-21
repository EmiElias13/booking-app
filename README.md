# booking-app

Physio appointment booking UI. The React app talks to a Supabase table over HTTP — no backend server.

Guest booking uses the anon key. Approvals require a signed-in physio (Supabase Auth). HTTP middleware blocks each role from the other role's REST calls; RLS enforces the same split in the database.

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. Run `supabase/schema.sql` in the project's SQL editor.
3. Create an Auth user for the physio (Authentication → Users → Add user).
4. Copy `react-app/.env.example` to `react-app/.env.local` and fill in the project URL and anon key (Settings → API).
5. Install and start the app:

```bash
cd react-app
npm install
npm run dev
```

Guests request slots on `/`. The physio signs in at `/login` to review them on `/approvals`.
