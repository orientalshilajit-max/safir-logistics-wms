# Safir Logistics WMS

Next.js App Router dashboard for a prep center WMS, backed by Supabase Auth,
PostgreSQL, Row Level Security, and Supabase Storage.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from your Supabase project values:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is optional for normal dashboard usage, but required
for automatic client login invitations from the Clients page. Never expose it as
a `NEXT_PUBLIC_` variable.

3. Start the development server:

```bash
npm run dev
```

Open the URL printed by the Next.js dev server.

## Supabase Setup

1. Create a Supabase project.
2. Apply the SQL migrations in `supabase/migrations` in timestamp order.
3. In Supabase Auth, create the initial admin user manually.
4. Set the admin user's `app_metadata`:

```json
{
  "role": "admin"
}
```

5. For client users, use the Clients page action `Create Login Access`.
   Automatic invites require `SUPABASE_SERVICE_ROLE_KEY` in the server
   environment. If it is missing, the app shows manual setup instructions.
6. Confirm the `shipping-labels` Supabase Storage bucket exists. The shipping
   label migration creates it and adds Storage RLS policies for admins,
   warehouse operators, and client-owned paths.

## Environment Variables

Required in local and Vercel environments:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only, optional but recommended:

- `SUPABASE_SERVICE_ROLE_KEY`

Only `NEXT_PUBLIC_*` values are bundled into client components. Keep service
role keys server-only.

## Vercel Deployment

1. Push the repository to GitHub.
2. Import the GitHub repository into Vercel.
3. Set the environment variables listed above in Vercel Project Settings.
4. Deploy with Vercel's default Next.js settings.
5. In Supabase Auth settings, add your production Vercel domain to allowed
   redirect/site URLs.
6. Run a production smoke test:
   - Admin login redirects to the dashboard.
   - Client login only sees the client portal.
   - `Create Login Access` works when the service role key is configured.
   - Shipping label uploads create Storage objects under the client/request path.

## Verification

Before pushing or deploying:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Notes

- `.env.local`, `.next`, and `node_modules` are ignored by git.
- Middleware/proxy uses the access-token cookie to protect dashboard routes and
  enforce role-based navigation.
- Supabase RLS remains the source of truth for data access.
