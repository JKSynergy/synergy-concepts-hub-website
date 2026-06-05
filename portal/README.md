# SCH Portal

Next.js 15 + TypeScript portal for Synergy Concepts Hub. Admin + Client dashboards with Supabase backend.

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (free tier — monitor 500MB DB / 2GB bandwidth)

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Supabase project** at https://supabase.com (free tier)

3. **Run the migrations** in Supabase SQL Editor (in order):
   - `supabase/migrations/001_initial_schema.sql` — tables, RLS, auth trigger
   - `supabase/migrations/002_phase2_write_policies.sql` — project write policies + `deliverables` storage bucket
   - `supabase/migrations/003_phase3_bookings.sql` — bookings write policies + service catalog RLS + `leads` table
   - `supabase/migrations/003_phase4_finance.sql` — invoices, payments, paystack receipts
   - `supabase/migrations/004_phase5_polish.sql` — academy courses, project assignments, external portal URLs
   - Paste each into Supabase SQL Editor → New Query → Run

4. **Create your first admin user** via Supabase Dashboard → Authentication → Add User
   - Then run this SQL to set their role to `admin`:
     ```sql
     UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email@example.com';
     ```

5. **Environment variables** — create `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   NEXT_PUBLIC_PORTAL_URL=https://your-portal-domain.vercel.app
   ADMIN_NOTIFY_EMAIL=synergyconceptshub@gmail.com
   MARKETING_SITE_ORIGIN=https://synergyconceptshub.com
   ```
   > The service role key (Settings -> API) is required for the admin client invite flow. Keep it server-side only.

6. **Run locally**
   ```bash
   npm run dev
   ```

## Project Structure

```
app/
  login/        — Sign in page
  admin/        — Admin dashboard + routes
    clients/    — Client list + invite
    projects/   — Project list + detail
    bookings/   — Booking list + status actions
    services/   — Service catalog management
    leads/      — Quote request inbox
  client/       — Client dashboard + routes
    projects/   — Project list + detail
    bookings/   — Booking list + new request
  api/
    admin/invite — Service invite endpoint
    quote/      — Public quote request endpoint
lib/
  supabase/
    client.ts   — Browser client
    server.ts   — Server component client
    middleware.ts — Session refresh + route guards
  actions/
    projects.ts — Project/milestone/update CRUD
    bookings.ts — Service/booking/lead CRUD
  email/notify.ts — Optional transactional email
supabase/migrations/
  001_initial_schema.sql — Full database schema with RLS
  002_phase2_write_policies.sql — Project write policies + deliverables bucket
  003_phase3_bookings.sql — Booking policies + leads table
```

## Free Tier Monitoring

Watch these in the Supabase Dashboard → Usage:
- **Database size** — keep under 400MB buffer before 500MB limit
- **Storage** — store large deliverables in Cloudflare R2, not Supabase Storage
- **Bandwidth** — 2GB/mo
- **Connections** — enable connection pooling if you see errors

## Deploy

### Option 1 — Vercel CLI (quickest first deploy)

```bash
cd portal
npx vercel
```

- When prompted, set the root directory to `portal/`
- Add environment variables in the Vercel dashboard → Project Settings → Environment Variables

### Option 2 — GitHub → Vercel (auto-deploy on push)

1. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
2. Set **Root Directory** to `portal/`
3. Add the environment variables above
4. The workflow at `.github/workflows/deploy-vercel.yml` will auto-deploy on every push to `main`
   - Uncomment the deploy step (`if: ${{ false }}` → remove that line) after linking your Vercel project
   - Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as repository secrets

### After deploy

1. Update `js/site-config.js` `portalUrl` to your actual Vercel domain
2. Re-deploy the marketing site (Cloudflare Pages) so the quote form hits the live portal
