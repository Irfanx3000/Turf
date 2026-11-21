# Turf Web App (`apps/web`)

Next.js 15 App Router PWA — mobile-first customer pages, desktop-first
dashboards. Deep navy / emerald / off-white sports identity with light + dark
themes.

- **Stack**: TypeScript (strict), Tailwind CSS, shadcn-style UI kit on Radix
  primitives, Motion, TanStack Query, Zod (via `@turf/validation`), Lucide
  icons, Sonner toasts, next-themes.
- **No duplicated business logic**: the NestJS API is the source of truth;
  the client renders what it says.

## Scripts

```bash
npm install         # first time
npm run dev         # dev server on :3000
npm run build       # production build
npm run start       # serve the production build
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (next/core-web-vitals + TS rules)
```

## Routes

**Customer (mobile-first)**

| Route | Purpose |
|---|---|
| `/` | Home — hero, featured turfs |
| `/turfs` | Browse + filter + paginate |
| `/explore` | Nearby search (geolocation) |
| `/turfs/[slug]` | Detail — availability by day, slot picker (morning/afternoon/evening), details, reviews |
| `/booking/[turfId]` | Review selection, choose payment method |
| `/checkout` | Pay online (mock gateway in dev; Razorpay slot when configured) |
| `/booking-success` | Confirmation (confirms from the API, never from optimism) |
| `/my-bookings` | History, status tabs, cancel, complete payment |
| `/login`, `/register`, `/register-owner`, `/forgot-password`, `/verify` | Auth |
| `/notifications` | Inbox + mark read |
| `/profile` | Own profile |
| `/about`, `/contact`, `/offline` | Static + PWA offline fallback |

**Tenant dashboard (desktop-first, staff/manager/owner)** — `/tenant/*`:
dashboard (booked value vs collected vs pending venue, occupancy, daily
chart), locations, turfs, slots & pricing (templates + idempotent generation),
bookings (status tabs), customers, collections (mark venue payments
collected), revenue, staff (roles), settings.

**Admin console (super admin)** — `/admin/*`: overview (GMV, tenants, users,
recent audit), tenants (verify/suspend/reactivate), users
(search/enable/disable), turfs, bookings, payments, disputes (workflow not
faked — honest placeholder), settings (live adapter health).

`middleware.ts` gates `/my-bookings`, `/notifications`, `/profile`,
`/checkout`, `/booking-success`, `/tenant/*`, `/admin/*` on the presence of
the `turf_session` cookie — **UX only**; the API enforces real
authentication and authorization on every request.

## Talking to the API

All requests go through `lib/api-client.ts` (`api.get/post/put/patch/delete`
+ `qs` helper), which throws `ApiClientError` with `status`, `errorCode` and
`requestId` from the API's error envelope.

**Same-origin by default**: `API_URL` defaults to `/api/v1` and
`next.config.mjs` proxies `/api/v1/*` to the NestJS API
(`API_PROXY_TARGET`, default `http://localhost:4000`). Cookies stay
first-party and no CORS is needed. Set `NEXT_PUBLIC_API_URL` to an absolute
URL when the API is on a different origin.

Session state is TanStack Query (`useSession`, queryKey `["session"]`); the
httpOnly `turf_session` cookie carries auth (Bearer fallback exists for
non-browser clients).

## Conventions

- **Money**: always `formatMoney` from `lib/utils` — integer minor units,
  never floats, never `toFixed`.
- **Motion**: import from `@/motion` (single re-export point).
- **Dates**: venue-local dates are `YYYY-MM-DD` strings; slot times are UTC
  ISO and formatted with the venue timezone.
- **Mutations**: optimistic UI is avoided for money paths; invalidate queries
  on success and toast on `ApiClientError`.

## PWA

- `public/manifest.webmanifest` + icon set; installable.
- `public/sw.js` precaches the app shell and serves `/offline` on navigation
  failure. **It never caches `/api/*`** — cached data is never treated as
  authoritative for bookings or payments.
- Push handlers are registered and the API exposes Web Push subscription
  endpoints; with VAPID keys present, notifications are delivered, otherwise
  payloads are logged (never faked).

## Verification

```bash
npm run typecheck && npm run lint && npm run build   # all must pass
```

With the API running (`API_PROXY_TARGET` pointing at it), the booking flow
can be exercised end to end using the seeded demo accounts.
