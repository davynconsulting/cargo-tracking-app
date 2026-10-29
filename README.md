# NGB cargo tracking

Operations dashboard for tracking containers from port arrival through customs,
road transit, delivery and invoicing. Built from the Figma Make design
"Cargo Tracking Workflow App".

- **Dashboard** (`/`): KPIs, the selected shipment's journey, the shipment
  portfolio with search and status filters, recent milestone activity and a
  finance snapshot.
- **Admin workspace** (`/admin`): create and edit shipments, clients, invoices,
  documents and staff accounts.

## Static preview

`docs/index.html` is a standalone, read-only copy of the dashboard on the sample
data. Open it directly in a browser, or publish it with GitHub Pages
(Settings → Pages → deploy from branch `main`, folder `/docs`). It is a snapshot,
so it does not change when the app's data changes.

## Run it locally

Requires Node 24.22+ and pnpm 10.

```bash
cp .env.example .env        # then set PAYLOAD_SECRET to a long random string
pnpm install
pnpm seed                   # creates sample data and prints a staff login
pnpm dev                    # http://localhost:3000
```

`pnpm seed --reset` wipes shipments, clients and invoices and reloads the
sample data. Set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` to choose the
login instead of getting a generated password.

## Production

`pnpm build && pnpm start`. The default SQLite file and the local `media/`
folder need a persistent disk. On serverless hosts (Vercel and similar), point
`DATABASE_URL` at a hosted libSQL/Turso database and add a Payload storage
adapter for uploads.

## What changed from the Figma export

- Replaced Figma's hosted Payload backend (`@payloadcms/figma`) with SQLite, so
  the app runs anywhere. Your Figma data does not carry over; `pnpm seed` loads
  sample data instead.
- The dashboard now requires a staff login (it previously rendered every
  shipment and invoice to anonymous visitors) and shows the signed-in user
  instead of a hardcoded name.
- The "Outstanding" KPI totals balances per currency instead of adding TZS to USD.
- Sidebar items link to the matching admin screens.
- Staff can no longer promote themselves to administrator.
