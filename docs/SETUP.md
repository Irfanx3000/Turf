# Setup & Environment

Everything you need to run the platform locally and understand what each
environment variable does.

## Prerequisites

- Node.js 20+
- Docker (for Postgres + PostGIS and Redis) — or your own instances
- npm 10+ (workspaces)

## Local quick start

```bash
npm install                 # installs all workspaces
docker compose up -d        # Postgres (PostGIS) + Redis
cp .env.example .env        # defaults work with docker compose
npm run db:migrate          # apply SQL migrations (transactional, checksummed)
npm run db:seed             # idempotent demo data (Mumbai, turfs, 14 days of slots)
npm run dev                 # web → :3000, api → :4000/api/v1
```

- Swagger UI: http://localhost:4000/api/v1/docs
- Web app: http://localhost:3000

Demo accounts (created by the seed, dev auth adapter only):

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@turf.demo` | `Admin#12345` |
| Tenant owner | `owner@turf.demo` | `Owner#12345` |
| Customer | `customer@turf.demo` | `Customer#12345` |

## Build & run contract

The workspace packages (`shared-types`, `config`, `validation`, `db`) and the
NestJS API are CommonJS and must be compiled with `tsc` (they rely on
experimental decorator metadata, which `tsx`/esbuild do not emit):

```bash
npm run build:packages   # shared-types → config → validation → db
npm run build:api        # NestJS → apps/api/dist
node apps/api/dist/main.js
npm run build:web        # Next.js production build
npm run start --workspace=@turf/web
```

`tsx` is used only for database scripts (`db:migrate`, `db:seed`,
`db:rollback`).

## Environment variables

Validated at boot by `packages/config/src/env.ts` (Zod) — a malformed variable
fails fast instead of at 2am.

### Core

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `APP_URL` | `http://localhost:3000` | Web app origin (links in emails, CORS) |
| `API_URL` | `http://localhost:4000/api/v1` | Canonical API URL |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowlist |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `RATE_LIMIT_MAX` | `100` | Requests per window per IP |
| `RATE_LIMIT_TTL_SECONDS` | `60` | Rate limit window |

### Database (Supabase / Postgres)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Pooled connection (PgBouncer in Supabase) |
| `DIRECT_URL` | Direct connection for migrations |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **API server only — never in the browser.** Used by the service DB role (BYPASSRLS) |

Two DB roles are provisioned by migration `0002`:

- `turf_app` — used by request handling; RLS policies apply.
- `turf_service` — BYPASSRLS for maintenance jobs; **no DELETE** on money and
  audit tables.

### Auth

| Variable | Notes |
|---|---|
| `JWT_DEV_SECRET` | Dev-only JWT signing secret for the development auth adapter. Must not be set/used in production. |

When Supabase credentials are present the API verifies real Supabase JWTs;
otherwise it boots with a **dev auth adapter** (clearly reported by
`/api/v1/health` as `auth: "dev-adapter"`). The dev adapter never runs when
`NODE_ENV=production`.

### Redis / BullMQ

| Variable | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | When unreachable, the API logs a warning and falls back to in-process timers for maintenance jobs (dev convenience — never claimed as production-grade). |

### Payments (Razorpay)

| Variable | Notes |
|---|---|
| `RAZORPAY_KEY_ID` | Together with the two below, activates the real adapter |
| `RAZORPAY_KEY_SECRET` | Server-side only |
| `RAZORPAY_WEBHOOK_SECRET` | HMAC-SHA256 verification of webhook payloads |
| `PAYMENT_MOCK_SECRET` | Secret used to sign the **mock** gateway's webhook (dev). Default `mock-webhook-secret`. |

When any Razorpay variable is absent the API uses a deterministic **mock
gateway** (`payments: "mock-adapter"` in `/health`): orders are created
locally, and `POST /api/v1/payments/mock/pay` simulates a customer paying —
the payment is only recorded after it flows through the same
signature-verified webhook path the real gateway uses. The mock endpoint
refuses to run when Razorpay is active.

### Maps

| Variable | Default | Notes |
|---|---|---|
| `MAPS_PROVIDER` | `mock` | `google` / `mapbox` / `mock` |
| `GOOGLE_MAPS_API_KEY` | | Required when provider is `google` |
| `MAPBOX_ACCESS_TOKEN` | | Required when provider is `mapbox` |

### Web Push (VAPID)

| Variable | Notes |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push keys; generate with `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:` contact |

Without keys, push subscriptions are still accepted and stored, but sends log
the payload instead of delivering (reported honestly, never faked).

### Email / SMS

`EMAIL_PROVIDER` (`mock`/`smtp`/`resend`) and `SMS_PROVIDER`
(`mock`/`twilio`/`msg91`) — mock adapters log instead of sending.

### Booking engine tuning

| Variable | Default | Notes |
|---|---|---|
| `RESERVATION_TTL_SECONDS` | `900` | How long an unpaid online booking holds its slots before the sweeper releases them |

### Web app (`apps/web`)

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `/api/v1` (same-origin) | Browser API base. Same-origin by default: the Next server proxies `/api/v1/*` to the API so cookies stay first-party and no CORS is needed. Set an absolute URL when the API lives on another origin. |
| `API_PROXY_TARGET` | `http://localhost:4000` | Server-only: where the Next rewrite proxy forwards `/api/v1/*` |

## Health checks

`GET /api/v1/health` reports the live state of every adapter:

```json
{
  "status": "degraded",
  "checks": {
    "database": "up",
    "auth": "supabase",
    "payments": "razorpay",
    "maps": "google"
  }
}
```

`degraded` (not `down`) is normal in local development with adapters in mock
mode. The admin console's **Settings** page surfaces the same report.
