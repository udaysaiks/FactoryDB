# Vercel deployment

Vercel hosts both the Vite frontend and the Express API. Supabase provides persistent Postgres storage; the Vercel filesystem is not used for application data.

## 1. Create the Supabase database

1. Create a Supabase project and open **SQL Editor**.
2. Run this SQL to create the private application tables:

```sql
create table public.app_state (
  id integer primary key check (id = 1),
  payload jsonb not null
);

create table public.auth_sessions (
  token_hash text primary key,
  role text not null check (role in ('admin', 'worker')),
  worker_id text,
  worker_name text not null,
  expires_at timestamptz not null
);

create index auth_sessions_expires_at_idx
  on public.auth_sessions (expires_at);

create table public.login_attempts (
  ip_hash text primary key,
  count integer not null check (count >= 0),
  reset_at timestamptz not null
);

alter table public.app_state enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.login_attempts enable row level security;
```

The app accesses these tables only through the server using its service-role key. Do not add public/anonymous access policies.

3. In Supabase project settings, copy the project URL and the server-side `service_role` key. Keep the key private.

## 2. Configure and deploy on Vercel

1. Import the GitHub repository into Vercel.
2. Add these environment variables to the Vercel project (at least for **Production**):
   - `SUPABASE_URL` = the Supabase project URL, such as `https://your-project.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = the Supabase server-side service-role key
   - `ADMIN_SECRET` = a unique administrator secret of at least 16 characters
3. Generate an administrator secret locally in PowerShell with:

```powershell
node -p "require('crypto').randomBytes(32).toString('base64url')"
```

Paste it directly into Vercel's `ADMIN_SECRET` variable. Do not commit or share it. The admin login screen uses this exact value.

4. Remove any existing `VITE_API_BASE_URL` variable; the frontend calls the API on the same Vercel domain.
5. Deploy or redeploy after setting the variables.

## 3. Verify

- Open `https://your-project.vercel.app/api/healthz`; it should return `{"ok":true}`.
- Open the Vercel site and log in as Admin using the `ADMIN_SECRET` value.
- The database state is initialized with demo data the first time the API is used.

## Operations

- Never put `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_SECRET` in a `VITE_` variable; Vite variables are exposed to browsers.
- Supabase backups and plan limits depend on your Supabase plan. Back up important factory data regularly.
- The application uses one JSON state row. Avoid running multiple app instances that write the same record simultaneously.
- Supabase starts with demo data; the ignored local SQLite/database files are not uploaded or migrated automatically. Export and migrate any local records you need before using the deployed app.
