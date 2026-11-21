# Booking & Payment Engine

How a booking goes from "two customers tap the same slot" to "money verified"
without ever double-booking, and what happens when things go wrong.

## The invariants

1. **A slot can be held by at most one active booking.** Enforced in the
   database, not in application code.
2. **Booking status and payment status are separate.** A pay-at-venue booking
   is `confirmed` while its payment is `pending` until the counter marks it
   collected.
3. **Money is integer minor units** end to end (DB `bigint`, API, web).
4. **Prices are always computed server-side.** The client sends slot ids; the
   quote/booking endpoints price them from the DB (with pricing rules
   applied). A tampered client total is ignored.
5. **Every request is authenticated and authorized server-side.** Tenant
   isolation is enforced by guards *and* re-checked in every service query,
   with RLS underneath.

## Creating a booking

`POST /bookings` with `{ turfId, slotIds, paymentMethod, idempotencyKey }`:

1. **Idempotency** — `idempotencyKey` is UNIQUE per customer. Replaying the
   same key returns the original booking instead of creating a second one.
2. **Row locks, ordered** — the slots are locked with `SELECT ... FOR UPDATE`
   in a deterministic order (by slot id), so two concurrent transactions
   cannot deadlock; the second one waits for the first.
3. **CAS update** — the slot claim itself is a compare-and-swap update
   (`WHERE status = 'available'` → `reserved`/`booked`). Zero rows updated
   means someone else won; the transaction aborts with a clean 409.
4. **Exclusion constraints** — even if application logic were bypassed, a DB
   exclusion constraint rejects overlapping active holds on the same slot.
5. **Compensation** — if anything fails after the claim (payment provider
   error, network), `cancelReservation` releases the slots before the error
   surfaces.

### Payment method branches

- **`pay_at_venue`** → booking is `confirmed` immediately, a `pending`
  pay-at-venue payment row is created, and the tenant collects at the counter
  (`POST /tenants/:tenantId/payments/:paymentId/collect`, staff+).
- **`online`** → booking is `pending_payment`, an order is created with the
  gateway (Razorpay or mock), and `reservationExpiresAt = now +
  RESERVATION_TTL_SECONDS` (default 15 min). The customer is handed the order
  to pay; the booking only confirms on a **verified webhook**.

## Payments & webhooks

- The webhook route (`POST /payments/webhook/:provider`) receives the **raw
  body** (captured before the JSON parser) and verifies the provider's
  HMAC-SHA256 signature with `timingSafeEqual`. Invalid signature → rejected
  before any state changes.
- **Webhook idempotency** — `payment_events` has a UNIQUE (provider,
  event_id); replays and at-least-once redeliveries are no-ops.
- `confirmPaidBooking` is the single path from "money verified" to
  "booking confirmed": it re-locks the booking row and
  - if the booking is still `pending_payment` → confirm + mark payment paid;
  - if the reservation already **expired** (late capture) → refund the
    payment, never resurrect the booking;
  - if already confirmed (duplicate webhook) → no-op.
- **Underpayment** is detected (amount < booking total) and flagged rather
  than silently accepted.
- `POST /admin/payments/reconcile` polls the gateway for stale pending
  orders; a maintenance timer also runs it periodically.

### Development gateway (mock)

Without Razorpay credentials the mock adapter is used and
`POST /payments/mock/pay` simulates the customer paying: it signs a webhook
with `PAYMENT_MOCK_SECRET` and delivers it through the **same verification
path** as production. The mock refuses to run when Razorpay is active.

## Reservation TTL & maintenance

`JobsService` (BullMQ when Redis is reachable, in-process timers otherwise)
runs:

- `release_expired_reservations()` every 60s — frees slots of unpaid online
  bookings whose TTL elapsed;
- `mark_past_bookings_completed()` every 10 min — `confirmed` → `completed`
  once the slot time passes (feeds analytics + review eligibility);
- payments reconcile every 5 min.

## Cancellation & refunds

`POST /bookings/:bookingId/cancel` (customer, or tenant member):

Refunds are computed by `computeRefundDue` (pure, unit-tested):

| Policy | Refund |
|---|---|
| pay-at-venue or paid ≤ 0 | 0 (nothing collected) |
| `free_until_24h` | full if cancelled ≥ 24h before start, else 0 |
| `free_until_2h` | full if cancelled ≥ 2h before start, else 0 |
| `non_refundable` | 0 |
| `custom` | tenant-defined percent |

Refunds carry their own status (`pending`/`processed`/`failed`) and are
processed through the gateway adapter — never assumed.

## Concurrency proof

`apps/api` ships a DB integration test that fires **two concurrent bookings
for the same slot** and asserts exactly one succeeds and the other receives a
conflict (409), plus an idempotency test (same key replayed returns the same
booking). These run against a real Postgres when `DATABASE_URL` is set and
auto-skip otherwise — they are never faked.

```bash
DATABASE_URL=postgres://... npm test --workspace @turf/api
```
