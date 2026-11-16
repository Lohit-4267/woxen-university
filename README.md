# Arzon Global × CrowdCore Woxsen — campus site

Full working website for the Arzon × CrowdCore (Woxsen) career-programmes campaign:

- **Public site** (`/`) — your original single-page design, unchanged visually, now powered by a real backend.
- **Database** — Postgres (Supabase in production; an embedded PGlite Postgres for local dev, no install needed). Holds programmes, events, FAQ, benefits, pricing/contact settings, and every form submission. All tables live in the `arzon` schema.
- **Admin dashboard** (`/admin`) — sign in to see and manage leads and to edit all site content without touching code.

## Quick start

Requires **Node.js 22.9+**.

```bash
npm install
```

```bash
cp .env.example .env    # then set ADMIN_EMAIL / ADMIN_PASSWORD
```

```bash
npm start
```

Open http://localhost:3000 for the site and http://localhost:3000/admin for the dashboard.
With no `DATABASE_URL`, a local Postgres (PGlite) is created in `data/pglite/`. On first boot the tables are created, seeded with all the content from the original design, and the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` is created.

Add or reset an admin any time:

```bash
npm run create-admin -- you@arzonglobal.com "a-long-password" "Your Name"
```

Run the tests:

```bash
npm test
```

## What the admin can do

| Section | What it does |
|---|---|
| **Dashboard** | Totals, today / 7-day counts, 30-day chart, leads by form, top programmes, BBA/MBA year split, channel (utm_medium), Growth Squad leaderboard, event seat fill. |
| **Leads** | Search & filter every submission (roadmap leads, event seats, waitlists, Squad applications). Open a lead to see full details, WhatsApp/email links, attribution, and other submissions from the same person. Set status (New → Contacted → Qualified → Enrolled / Not interested / Spam), add notes, bulk-update, delete, **export CSV**. |
| **Programmes** | Create/edit/hide all tracks: names, category, enrolling vs. coming-soon, home-page flag, BBA/MBA fit, roles, tools, certifications, hiring signal, pay, curriculum modules, capstone. |
| **Events** | Create/edit events with date/time (IST), venue, host, seat limit, linked programme. Registrations are capped at the seat limit and the site shows "X seats left" / "Full". |
| **Growth Squad** | Ambassadors and referral codes, leads & enrolments credited per code, copy referral links, one-click approve an application into an ambassador. |
| **FAQ / What you get** | Edit FAQ entries and the benefit cards and their detail pages. |
| **Settings** | Contact (phone, WhatsApp, email, address), pricing (fee, list price, registration fee, scholarship), registration URL, "coming soon" waitlists on/off, cohort, and the Market Masters case challenge. |
| **Account** | Change password, add/remove admins. |

All content edits show on the public site within seconds — no redeploy.

## How it fits together

```
public/index.html        Original design. Loads /site-data.js (content from DB) and posts forms to /api/submissions
public/assets/brand.js   Logo + favicon images (extracted from the original file)
public/admin/            Admin dashboard (vanilla JS, no build step)
index.js                 Entry point (exports the app for Vercel; `npm start` runs a server)
server/app.js            Express app
server/routes/public.js  /site-data.js, /api/content, /api/submissions, /api/health
server/routes/admin.js   /api/admin/* (cookie session auth)
server/db/index.js       Postgres/PGlite drivers, schema migrations, first-run seed
server/db/seed.json      Initial content (from the original design)
```

### Changes made to the original page

- Content (`ARZON_CONFIG` / `ARZON_DATA`) is no longer hard-coded — it's served from the database via `/site-data.js`.
- Forms POST JSON to `/api/submissions`. Validation errors (e.g. event full) show as a toast; if the server can't be reached, the original email fallback still kicks in so no lead is lost.
- Waitlist/roadmap submissions also send the programme id; events show seats left and "Full".
- A hidden honeypot field filters bots.

### Security

- Admin passwords hashed with scrypt; sessions are random tokens stored hashed, in an HttpOnly, SameSite cookie (Secure in production).
- Login and form submissions are rate-limited per IP; cross-origin writes are rejected; event seats are locked per row so they can't oversell.
- Visitor IPs are never stored raw (salted hash only). CSV export neutralises spreadsheet-formula injection.
- All admin-entered content is escaped when embedded in the page.

## Deploying

**Production: Vercel + Supabase.**

- Vercel runs `index.js` (the Express app) as a function and serves `public/` from its CDN. Every push to `main` deploys automatically.
- Supabase holds the data. The app connects as a dedicated `arzon_app` role that owns only the `arzon` schema (not exposed through Supabase's Data API). Tables are created and seeded automatically on first boot.
- Vercel environment variables: `DATABASE_URL` (Supabase pooler URL, port 6543), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `IP_SALT`, optional `NOTIFY_WEBHOOK_URL`.

**Anywhere else (VPS, Railway, Render, Docker):** set the same variables and run `npm start`, or:

```bash
docker build -t arzon-woxsen .
```
```bash
docker run -d -p 3000:3000 -e DATABASE_URL=postgres://... -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD=change-me-please arzon-woxsen
```

**Backups:** Supabase takes daily backups; you can also export leads as CSV from the admin.

## Before going live — confirm with Arzon

Carried over from the original file's TODOs; all editable in the admin:

- Event dates/venues — most seeded events are already in the past; add the real upcoming ones under **Events**.
- Cohort start date (**Settings → Cohort**) and Market Masters dates (**Settings → Case challenge**).
- Curriculum modules/tools/certifications for each programme (**Programmes**).
- Whether the "coming soon" tracks should show as waitlists (**Settings → Site**).
