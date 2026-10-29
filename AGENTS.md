# NGB cargo tracking

Next.js 16 + Payload 4 (beta) + Tailwind CSS v4. Originally exported from Figma
Make, now self-hosted: Payload uses a SQLite database (`@payloadcms/db-sqlite`)
instead of Figma's hosted backend, and uploads are stored on local disk.

## Layout

- `src/app/(frontend)/` - the operations dashboard (`page.tsx` loads data,
  `operations-dashboard.tsx` renders it). Staff-only: visitors are redirected to
  `/admin/login`.
- `src/app/(payload)/` - Payload admin panel and API routes (generated; don't edit).
- `src/collections/` - data model: Shipments, Clients, Invoices, Admins (staff
  logins with roles), Media, Folders, Tags. Access rules live in `access.ts`.
- `src/seed.ts` - sample data (`pnpm seed`, `pnpm seed --reset`).
- `.figma/make/site.json` - title, favicon and analytics settings read by the
  layout. Empty is fine.

## Rules

- Node 24.22+ and pnpm 10 (see `packageManager`).
- `PAYLOAD_SECRET` must be set. `DATABASE_URL` defaults to `file:./data/cargo.db`.
- After changing collections, run `pnpm generate:types` and `pnpm generate:importmap`.
- SQLite/Postgres identifiers are capped at 63 characters; give deeply nested
  select fields a short `dbName`.
- User-facing Local API calls must pass `overrideAccess: false` and the `user`.
- Only `admin`-role staff can create staff accounts or change roles.
