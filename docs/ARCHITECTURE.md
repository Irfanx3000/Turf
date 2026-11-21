# Architecture — Turf Booking SaaS

Multi-tenant turf-booking platform starter: a **modular monolith** API (NestJS), a
PWA frontend (Next.js App Router), and a **Supabase PostgreSQL + PostGIS**
database, orchestrated as an npm workspace monorepo.

```
┌──────────────────────────── apps/web (Next.js PWA) ────────────────────────┐
│  Customer app · Tenant dashboard · Super-admin console                     │
│  TanStack Query · RHF + Zod · Tailwind · shadcn/ui · Motion                │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  HTTPS  /api/v1  (JWT Bearer from Supabase Auth)
┌───────────────▼───────────────── apps/api (NestJS) ────────────────────────┐
│  Modules: Auth Users Tenants Locations Turfs Sports Amenities Slots        │
│           Pricing Bookings Payments Refunds Notifications Push Analytics   │
│           Reviews Admin AuditLogs Jobs Health                              │
│  Guards: JwtAuthGuard → RolesGuard → TenantMemberGuard                     │
│  Cross-cutting: request-id, structured logs, exception filter,             │
│  validation pipe, rate limit, CORS, Swagger                                │
│                                                                            │
│  Booking engine (tx + row locks)      Payment adapters (Razorpay|mock)     │
│  Notification workers (BullMQ)        Maps adapter (Google|Mapbox|mock)     │
└───────┬─────────────────────────────────┬──────────────────────────────────┘
        │ SQL (Drizzle)                   │ enqueue/consume
┌───────▼──────────────────┐   ┌──────────▼───────────┐
│ Supabase Postgres+PostGIS│   │ Redis (BullMQ)       │
│ RLS on every table       │   │ reminders, retries   │
└──────────────────────────┘   └──────────────────────┘
```

## Monorepo layout

```
apps/
  web/                      Next.js App Router PWA (customer + tenant + admin)
  api/                      NestJS modular monolith, REST /api/v1
packages/
  shared-types/             Enums + API contracts used by web & api
  validation/               Zod schemas (DTO source of truth)
  config/                   Environment parsing/validation (zod)
  db/                       Drizzle schema, hand-authored SQL migrations,
                            RLS policies, migration runner, seed
docs/                       Architecture, ER diagram, API reference
```

## Key decisions

### 1. Modular monolith
One deployable API. Modules map to domain boundaries (bookings, payments,
slots…). Each Nest module owns its tables and services; cross-module access
goes through exported services, never another module's tables. This keeps the
option to extract a module into a service later without a rewrite.

### 2. Two database roles, two trust levels
| Pool | Role | RLS | Used by |
|---|---|---|---|
| user pool | `turf_app` | **enforced** | request-scoped reads; the API sets `request.jwt.claim.sub` per transaction so Supabase `auth.uid()` policies apply |
| service pool | `turf_service` | BYPASSRLS | the transactional booking/payment engine, webhook processing, background jobs, seeds |

The service pool exists because booking transactions must update tenant-owned
slot rows on behalf of a customer atomically — impossible under customer-scoped
RLS. The application layer authenticates (verified JWT) and authorizes
(guards + explicit tenant checks) **before** touching the service pool, and
never trusts client-supplied ids, prices, roles or payment states. RLS remains
a real, tested boundary for everything that goes through the user pool and for
any direct-to-Supabase access with anon/authenticated keys.

Dev passwords live in migration `0013` for one-command local setup — change
them out-of-band for any shared environment (see `docs/SETUP.md`).

### 3. Auth
Production: Supabase Auth issues JWTs; the API verifies signature, issuer and
audience (`SUPABASE_URL` + project ref audience) via JWKS. The API never sees
passwords.
Development without Supabase: a **dev adapter** verifies scrypt credentials in
the `dev_users` table (migration `0014`) and signs short-lived HS256 JWTs with
`JWT_DEV_SECRET`. It refuses to activate outside `NODE_ENV=development|test`.
`profiles.id` intentionally does not FK into `auth.users` so both modes share
one schema; on Supabase, a trigger keeps profiles in sync with auth users.

### 4. Money
Integer minor units (paise) end to end — `bigint` in Postgres, `number` (safe
below 2^53) in TS. Validation rejects non-integers. `total_amount_minor`,
`paid_amount_minor`, `refunded_amount_minor` are separate columns with CHECK
constraints (`paid <= total`, `refunded <= paid`). Booked value ≠ collected
money: dashboards compute both from bookings and payments respectively.

### 5. Booking engine (see docs/BOOKING-ENGINE.md)
- Slots are **materialized rows** (`turf_slots`) with status
  `available|reserved|booked|blocked|expired`.
- Claim = conditional `UPDATE … WHERE id = $1 AND status='available'` inside a
  transaction with `SELECT … FOR UPDATE`; if zero rows update, the slot is gone
  → 409.
- DB-level guarantees:
  - `booking_items.slot_id` UNIQUE — a slot belongs to at most one booking ever;
  - exclusion constraint `turf_slots_no_overlap` (GiST on `turf_id` =, period
    &&) — no two active overlapping slots per turf;
  - CHECK `(status IN ('reserved','booked')) = (booking_id IS NOT NULL)`.
- Online flow: reserve (TTL, default 15 min) → payment order → webhook
  (signature-verified, idempotent via `payment_events.event_id` unique) →
  atomic confirm.
- Pay-at-venue flow: atomically reserve + confirm with payment pending.
- Expired reservations released by `release_expired_reservations()` (SQL,
  row-locked, idempotent) invoked by a BullMQ repeatable job.
- Idempotent creation: `UNIQUE (customer_id, idempotency_key)`.

### 6. Notifications
`notifications` (user-visible rows) + `notification_jobs` (delivery attempts
with `idempotency_key` unique, attempts, last_error). BullMQ workers deliver
via adapters: Web Push (VAPID), email, SMS/WhatsApp. Reminders (24 h / 1 h
before) are scheduled as delayed jobs at confirmation time. Push delivery is
best-effort — the platform never claims guaranteed delivery; the canonical
state is always the database.

### 7. Provider adapters
Every external provider sits behind an interface with a **mock implementation
for local development** (payments: deterministic mock gateway with the same
webhook contract; maps: static fallback; email/SMS: logged to console). When
credentials are absent the app runs on mocks and says so on `/health` —
nothing is faked as production.

### 8. Multi-city from day one
`cities` (with IANA timezone) → `locations` → `turfs`. Distances via PostGIS
`geography` + `ST_DWithin`/`ST_Distance`. Launching one city is a seed-data
decision, not a schema change.

### 9. API conventions
- `/api/v1`, versioned via URI.
- Every response carries `x-request-id`; errors use a stable envelope
  `{ statusCode, message, errorCode, requestId, timestamp }`.
- Zod DTO validation (shared package) at the edge; Swagger generated from the
  same types.
- Rate limiting per IP+route (Redis-backed in production, in-memory fallback).

### 10. PWA
Web manifest + service worker with: app-shell precache, network-first pages,
cache-first static assets, **runtime caching never stores** booking, payment,
tenant or auth responses. Offline fallback page states clearly that booking
and payment need connectivity; availability always revalidates.

## Testing strategy
- **Unit**: pricing, cancellation policy, webhook signature verification,
  reservation-expiry decisions, money math.
- **Integration (DB)**: migrations up/down, RLS policy matrix, booking
  concurrency (parallel claims → exactly one winner), webhook idempotency.
  These skip automatically when `DATABASE_URL` is absent.
- **E2E**: Playwright smoke of the customer happy path (browse → book →
  pay-at-venue → confirmation) against the mock payment gateway.

## Environment variables
See `.env.example` — every variable is documented there and validated by
`packages/config` at boot. Only `NEXT_PUBLIC_*` values ever reach the browser;
the Supabase service-role key is API-only.
