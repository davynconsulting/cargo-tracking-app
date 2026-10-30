# cargo-tracking-app

NGB Logistics cargo tracking: Phase 1 prototype of the API, background worker and three
installable web apps, built from the Cargo Tracking Functional Specification v1 (FRS) and the
architecture doc.

## What works

- **Shipments and containers.** Registration with ISO 6346 container-number checks, unique
  references (`NGB-2026-00001`), and duplicate BL and container rejection.
- **Status model (FRS 4).** Documents, customs and vessel arrival are tracked on the shipment;
  journey and empty return are tracked on each container. The overall status is derived from the
  least advanced container, e.g. "loaded, 1 of 2 ahead".
- **Transition rules.** Each role may record only its own milestones. Gate-out is blocked until
  customs release; only an ops manager can override, and only with a reason, which is audited.
- **Append-only ledger.** Every event stores event time, recorded time, user and source.
  Corrections are new rows. The database refuses updates and deletes on the ledger.
- **Client isolation.** Row-level security in PostgreSQL scopes every query to the caller's
  organization. Drivers see only shipments on their own trucks.
- **Notifications.** A transactional outbox and a worker handle notifications. Each message goes
  only to contacts who opted in, in their language where a template exists, and never twice for
  the same event, recipient, channel and template. A provider outage queues messages with
  backoff; after 6 failed attempts the message is marked failed and raised to staff.
- **ETA revisions.** History is kept, and the client is told only when the change passes the
  FRS 7.1 threshold (2 h same-day, 6 h otherwise).
- **Exceptions are records, not a status.** Missing documents, customs holds, port processing
  over its estimate, transit silence and overdue empty returns open automatically. Each has an
  owner, a next action and a due time, and clears when the matching milestone arrives.
- **Documents.** The file type is checked from the file's own bytes. Downloads go through
  5-minute links, issued only after an access check.
- **Finance.** Invoices with lines, partial payments, finance-only verification and receipts.
  The balance counts verified payments only. Each reminder stage is sent once.
- **Closure.** Closure checks cover delivery, empty return, open exceptions and finance. An ops
  manager can close with a recorded exception.

## Web apps (`apps/web`)

Three installable PWAs from one React codebase. Each has its own manifest, icon and service-worker
scope, so a driver installs only the driver app.

- **Client portal (`/client/`).** Shipments with derived status, ETA and the reason it changed,
  per-container progress, documents through expiring links, timeline, invoices with verified
  payments, the message log, and per-contact WhatsApp, email and app-notification consent.
- **Driver app (`/field/`).** Trips assigned to the signed-in driver, one large button per allowed
  milestone, seal, border, receiver and depot fields, an optional compressed photo (the proof of
  delivery on delivery), and problem reports. Milestones recorded with no signal are queued on the
  phone with the time of the tap and an idempotency key, and sent when signal returns. English and
  draft Swahili.
- **Operations console (`/staff/`).** Shipment list and detail, milestones with overrides where the
  rules allow, truck assignment, ETA revision with the notification threshold explained,
  time corrections, document upload, exceptions queue, invoices and payment verification, message
  log with retry, closure with checks, and registration with live ISO 6346 checks.

The apps reuse the API's pure rules from `apps/api/src/domain` (milestone labels, container check
digits), so the client-side checks cannot drift from the server's.

## Not built yet

- Server-side web push. The apps ask for notification permission and the service worker handles
  push events, but the API does not store subscriptions or send pushes yet. On iPhone, web push
  only works once the app is added to the home screen.
- Problem reports from the driver app need signal; only milestones are queued offline.
- Sessions are kept in `localStorage`. Production should use httpOnly cookies.
- A real WhatsApp, web push or email provider. Messages are logged for now.
  `src/notifications/senders.ts` is the seam.
- S3 storage. Files go to local disk; `src/documents/storage.ts` is the seam.
- Malware scanning, MFA, rate limiting and password reset.
- Escalation of an overdue exception from its owner to the ops manager.

## Run it locally

Requires Node 22 and Docker (or a local PostgreSQL 16).

```sh
docker compose up -d db
npm install
cd apps/api
cp .env.example .env            # then edit JWT_SECRET
export $(grep -v '^#' .env | xargs)
npm run db:seed                 # runs migrations, then loads demo data
npm run dev                     # API on http://localhost:3000, OpenAPI at /docs
npm run worker:dev              # in a second terminal: notifications and SLA checks
cd ../web && npm run dev        # in a third terminal: http://localhost:5173 (proxies /api to :3000)
```

Open http://localhost:5173/client/, /field/ or /staff/. To try the driver app on a phone, run
`npx vite --host` and open the address it prints; installing it needs HTTPS, which a tunnel such as
`cloudflared` or a deployed build provides.

Demo sign-ins all use the password `prototype-password`:

| Email | Role |
| --- | --- |
| ops@ngb.test | Operations manager |
| docs@ngb.test | Documentation officer |
| agent@ngb.test | Clearing agent |
| transport@ngb.test | Transport coordinator |
| finance@ngb.test | Finance officer |
| juma@ngb.test, hamisi@ngb.test | Drivers |
| aline@khl.test | Client: Kigali Hardware Ltd |
| baraka@mas.test | Client: Mwanza Agro Supplies (Swahili) |

## Tests

```sh
cd apps/api
npm test                                    # unit tests only
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```

With `TEST_DATABASE_URL` set, `test/acceptance.int.test.ts` also runs. It creates a fresh database
and covers the FRS section 12 acceptance criteria against real PostgreSQL.

```sh
cd apps/web
npm test                                    # unit tests: offline queue, API client, formatting
E2E_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npx playwright test
```

The browser tests run on a 375 px phone screen (AC-17). They create and seed an `ngb_e2e`
database, start the API on port 3100 the same way `npm run dev` does, and cover sign-in per app,
client isolation, offline milestone capture, container-number checks, the gate-out override and
no horizontal scrolling on every main screen.

## Layout

```
apps/api/
  drizzle/                 SQL migrations; 0001_security.sql holds roles, RLS and ledger triggers
  src/domain/              Pure rules: workflow, ETA threshold, money, notifications, ISO 6346
  src/db/                  Schema, transaction-with-identity helper, migrations, seed
  src/shipments/           Registration, milestones, truck assignment, ETA, corrections, closure
  src/exceptions/          Exception queue and the SLA monitor
  src/finance/             Invoices, payments, verification, reminders
  src/documents/           Uploads and expiring download links
  src/notifications/       Outbox draining and sending
  src/worker.ts            Background worker loop
  test/                    Acceptance tests against PostgreSQL
apps/web/
  client/ field/ staff/    One HTML entry per app
  public/                  Manifests, icons and the shared service worker
  src/shared/              API client, offline queue, sign-in, layout, shipment components
  src/client/ src/field/ src/staff/   Each app's screens
  e2e/                     Playwright tests at phone width
```
