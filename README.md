# Turf — Multi-Tenant Turf Booking SaaS Starter

A production-minded starter for a sports-turf booking platform: discover turfs,
check live availability, book slots, pay online (Razorpay) or at the venue, and
run the whole business from a tenant dashboard — with a super-admin console on
top.

**Stack**: Next.js App Router PWA · NestJS modular monolith · Supabase
PostgreSQL + PostGIS · Drizzle · Supabase Auth · Redis + BullMQ · Tailwind +
shadcn/ui · TypeScript strict everywhere.

## Quick start (local)

```bash
# 1. dependencies
npm install

# 2. infrastructure (Postgres+PostGIS, Redis)
docker compose up -d

# 3. environment
cp .env.example .env
#   local dev defaults work out of the box with docker compose
#   (dev auth adapter is used when Supabase credentials are absent)

# 4. database schema + demo data
npm run db:migrate
npm run db:seed

# 5. run both apps
npm run dev
#   web  → http://localhost:3000
#   api  → http://localhost:4000/api/v1 (+ /api/v1/docs for Swagger)
```

Demo accounts created by the seed (dev-only auth adapter):

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@turf.demo` | `Admin#12345` |
| Tenant owner | `owner@turf.demo` | `Owner#12345` |
| Customer | `customer@turf.demo` | `Customer#12345` |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | web + api in watch mode |
| `npm run build` | production builds of all workspaces |
| `npm run lint` / `typecheck` / `test` | quality gates (CI runs the same) |
| `npm run db:migrate` | apply SQL migrations (transactional, checksummed) |
| `npm run db:rollback` | roll back the last migration |
| `npm run db:seed` | idempotent demo data (Mumbai, 2 turfs, 14 days of slots) |

## Documentation

- [Architecture decisions](docs/ARCHITECTURE.md)
- [ER diagram & integrity guarantees](docs/ER-DIAGRAM.md)
- [Booking & payment engine](docs/BOOKING-ENGINE.md)
- [API reference](docs/API.md)
- [Setup & environment variables](docs/SETUP.md)

## What's inside

- **Booking engine** — atomic slot claiming with row locks, DB-level
  anti-double-booking constraints, reservation TTLs, idempotent creation,
  signature-verified idempotent payment webhooks, late-event reconciliation.
- **Multi-tenancy** — tenant isolation enforced by guards + RLS; one tenant,
  many locations, many turfs.
- **Payments** — Razorpay adapter + deterministic mock gateway for local dev;
  online and pay-at-venue flows; explicit refund policies.
- **Notifications** — Web Push / email / SMS adapters on BullMQ with retries
  and idempotency keys; reminder scheduling.
- **PWA** — installable, offline fallback, push-ready; cached data is never
  treated as authoritative for booking or payment.
- **Testing** — unit, DB integration (auto-skip without DATABASE_URL) and a
  concurrency test proving two clients cannot book the same slot.

## Security posture (summary)

Server-verified JWTs; no client-trusted ids, prices or roles; RLS on every
table; least-privilege DB roles; webhook signature verification; audit trail
for sensitive changes; rate limiting; safe error envelopes; secrets never in
the browser. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
