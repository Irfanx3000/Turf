# API Reference

REST API served by the NestJS modular monolith at **`/api/v1`**.
Interactive docs: **`/api/v1/docs`** (Swagger UI) and **`/api/v1/docs-json`**.

## Conventions

- **Auth** — httpOnly `turf_session` cookie (set by `/auth/login`,
  `/auth/register`) or `Authorization: Bearer <jwt>`. Routes annotated
  *(public)* need neither.
- **Error envelope** — every error responds with
  `{ statusCode, message, errorCode, requestId, timestamp }`.
- **Request id** — `x-request-id` is echoed on every response; supply your own
  to correlate logs.
- **Money** — all amounts are **integer minor units** (paise). Never floats.
- **Pagination** — list endpoints accept `page` / `pageSize` and return
  `{ items, total, page, pageSize }`.
- **Tenant scoping** — every `/tenants/:tenantId/...` route requires the
  caller to be a member of that tenant (owner/manager/staff) **and** every
  service query re-checks ownership server-side.

## Auth

| Method & path | Who | Description |
|---|---|---|
| `POST /auth/register` | public | Customer signup |
| `POST /auth/register-owner` | public | Signup + creates tenant org (owner role) |
| `POST /auth/login` | public | Email + password, sets session cookie |
| `POST /auth/logout` | public | Clears cookie |
| `GET /auth/me` | authenticated | Profile + tenant memberships |

## Users

| Method & path | Who | Description |
|---|---|---|
| `GET /users/me` | authenticated | Own profile |
| `PATCH /users/me` | authenticated | Update fullName / phone / avatarUrl |

## Tenants & members

| Method & path | Who | Description |
|---|---|---|
| `POST /tenants` | super admin | Create tenant |
| `GET /tenants/mine` | authenticated | Tenants the caller belongs to |
| `GET /tenants/:tenantId` | public | Tenant summary |
| `PATCH /tenants/:tenantId` | tenant manager+ | Update name/support info |
| `GET /tenants/:tenantId/members` | tenant staff+ | List members |
| `POST /tenants/:tenantId/members` | tenant manager+ | Add existing user (owner/manager/staff) |
| `PATCH /tenants/:tenantId/members/:memberId` | tenant manager+ | Change role (ownership transfer demotes other owners) |
| `DELETE /tenants/:tenantId/members/:memberId` | tenant manager+ | Remove member |

## Locations

| Method & path | Who | Description |
|---|---|---|
| `GET /tenants/:tenantId/locations` | tenant staff+ | List locations |
| `POST /tenants/:tenantId/locations` | tenant manager+ | Create (geocoded via maps adapter) |
| `PATCH /tenants/:tenantId/locations/:locationId` | tenant manager+ | Update |

## Catalog (public)

| Method & path | Description |
|---|---|
| `GET /turfs` | Browse + filter (sport, city, price, search) + pagination |
| `GET /turfs/nearby` | Geo search (`lat`, `lng`, `radiusKm`) via PostGIS |
| `GET /turfs/:slug` | Turf detail |
| `GET /turfs/:slug/availability?date=YYYY-MM-DD` | Slots for one venue-local date |
| `GET /turfs/id/:turfId/availability?date=` | Same, by turf id (booking review step) |
| `GET /sports`, `GET /amenities` | Catalog lookups |

## Turf management (tenant)

| Method & path | Who | Description |
|---|---|---|
| `GET /tenants/:tenantId/turfs` | tenant staff+ | List own turfs |
| `POST /tenants/:tenantId/turfs` | tenant manager+ | Create turf |
| `GET /tenants/:tenantId/turfs/:turfId` | tenant staff+ | Detail |
| `PATCH /tenants/:tenantId/turfs/:turfId` | tenant manager+ | Update |
| `PATCH /tenants/:tenantId/turfs/:turfId/status` | tenant manager+ | draft ⇄ published ⇄ archived |
| `PUT .../images` / `.../sports` / `.../amenities` / `.../operating-hours` | tenant manager+ | Sub-resource replacement |

## Slots, templates & pricing

| Method & path | Who | Description |
|---|---|---|
| `GET /tenants/:tenantId/turfs/:turfId/slot-templates` | tenant staff+ | List templates |
| `POST .../slot-templates` | tenant manager+ | Create template (days, hours, duration, price) |
| `DELETE .../slot-templates/:templateId` | tenant manager+ | Remove template |
| `POST .../slots/generate` | tenant manager+ | Materialize slots for a date range — **idempotent** (`{ created, skipped }`) |
| `GET .../slots?from&to[&statuses]` | tenant staff+ | Slot calendar window |
| `POST .../slot-blocks` / `DELETE .../slot-blocks/:blockId` | tenant manager+ | Block/unblock time (maintenance, rain) |
| `GET .../pricing-rules` / `POST` / `DELETE .../:ruleId` | tenant manager+ | Dynamic pricing (weekend, peak hours, special date) |
| `POST /turfs/:turfId/quote` | public | Server-side price quote for slot ids (never trust client totals) |

## Bookings

| Method & path | Who | Description |
|---|---|---|
| `POST /bookings` | authenticated | Create booking (slotIds, paymentMethod, idempotencyKey). pay_at_venue → instant confirm; online → `pending_payment` + reservation TTL |
| `GET /bookings/mine` | authenticated | Own history (filter by status) |
| `GET /bookings/:bookingId` | customer/tenant member/super admin | Booking detail |
| `GET /bookings/:bookingId/history` | same | Status timeline |
| `POST /bookings/:bookingId/cancel` | customer or tenant | Cancel; refund computed by policy |
| `GET /tenants/:tenantId/bookings` | tenant staff+ | Tenant bookings (filters + date range) |
| `POST /tenants/:tenantId/bookings/:bookingId/no-show` | tenant staff+ | Mark no-show |

Details, guarantees and the concurrency story: [BOOKING-ENGINE.md](BOOKING-ENGINE.md).

## Payments

| Method & path | Who | Description |
|---|---|---|
| `POST /payments/orders` | authenticated | Create/reuse an order for own pending booking |
| `POST /payments/mock/pay` | booking's customer (dev only) | Simulate gateway payment — flows through the signed webhook path |
| `POST /payments/webhook/:provider` | gateway (signed) | **Raw-body** HMAC verification; idempotent by (provider, eventId) |
| `GET /tenants/:tenantId/payments` | tenant staff+ | Payment ledger |
| `POST /tenants/:tenantId/payments/:paymentId/collect` | tenant staff+ | Mark pay-at-venue money collected |
| `POST /admin/payments/reconcile` | super admin | Poll gateway for stale pending orders |

## Reviews

| Method & path | Who | Description |
|---|---|---|
| `POST /reviews` | booking customer (completed) | One review per booking |
| `GET /turfs/:turfId/reviews` | public | Published reviews |
| `PATCH /tenants/:tenantId/reviews/:reviewId/moderation` | tenant manager+ | Publish / hide |

## Notifications & push

| Method & path | Who | Description |
|---|---|---|
| `GET /notifications/mine` | authenticated | Own notifications + unreadCount |
| `POST /notifications/:id/read` · `POST /notifications/read-all` | authenticated | Mark read |
| `GET /notifications/preferences` · `PUT` | authenticated | Channel preferences |
| `GET /push/vapid-public-key` | public | Web Push public key |
| `POST /push/subscribe` · `DELETE /push/subscribe` | authenticated | Manage subscription |

## Analytics (tenant)

| Method & path | Who | Description |
|---|---|---|
| `GET /tenants/:tenantId/analytics/overview?from&to` | tenant staff+ | Booked value vs collected (online/venue) vs pending venue, occupancy, daily series |

## Admin (super admin)

| Method & path | Description |
|---|---|
| `GET /admin/dashboard` | Platform counters, GMV, recent audit |
| `GET /admin/tenants` · `PATCH /admin/tenants/:id/status` | Verify / suspend / reactivate tenants |
| `GET /admin/users` · `PATCH /admin/users/:id/status` | User directory, enable/disable |
| `GET /admin/turfs` / `bookings` / `payments` | Cross-tenant views |
| `GET /admin/audit-logs` | Audit trail (filter by entity/actor) |

## Ops

| Method & path | Description |
|---|---|
| `GET /health` | Adapter + infrastructure status |
