# Entity–Relationship Diagram

PostgreSQL schema (packages/db/migrations). All PKs are UUIDs; all timestamps
`timestamptz` UTC; money columns are `bigint` minor units (paise).

```mermaid
erDiagram
    PROFILES ||--o{ TENANT_MEMBERS : "joins"
    TENANTS ||--o{ TENANT_MEMBERS : "has"
    TENANTS ||--o{ LOCATIONS : "owns"
    CITIES ||--o{ LOCATIONS : "contains"
    CITIES ||--o{ TENANTS : "based in"
    LOCATIONS ||--o{ TURFS : "hosts"
    TENANTS ||--o{ TURFS : "owns (denormalized for isolation)"
    TURFS ||--o{ TURF_IMAGES : "gallery"
    TURFS ||--o{ TURF_SPORTS : "plays"
    TURFS ||--o{ TURF_AMENITIES : "offers"
    TURFS ||--o{ OPERATING_HOURS : "per weekday"
    TURFS ||--o{ SLOT_TEMPLATES : "generates"
    TURFS ||--o{ TURF_SLOTS : "materialized"
    SLOT_TEMPLATES ||--o{ TURF_SLOTS : "origin"
    TURFS ||--o{ SLOT_BLOCKS : "closes"
    TURFS ||--o{ PRICING_RULES : "priced by"
    TURFS ||--o{ BOOKINGS : "for"
    TENANTS ||--o{ BOOKINGS : "owns (denormalized)"
    PROFILES ||--o{ BOOKINGS : "customer"
    BOOKINGS ||--o{ BOOKING_ITEMS : "contains"
    TURF_SLOTS ||--o| BOOKING_ITEMS : "claimed by (UNIQUE slot_id)"
    BOOKINGS ||--o{ BOOKING_STATUS_HISTORY : "lifecycle"
    BOOKINGS ||--o| BOOKING_CANCELLATIONS : "cancellation"
    BOOKINGS ||--o{ PAYMENTS : "paid via"
    PAYMENTS ||--o{ PAYMENT_EVENTS : "webhook receipts"
    PAYMENTS ||--o{ REFUNDS : "refunded"
    BOOKINGS ||--o{ REFUNDS : "refunded"
    PROFILES ||--o{ NOTIFICATIONS : "receives"
    NOTIFICATIONS ||--o{ NOTIFICATION_JOBS : "delivered by"
    PROFILES ||--o{ PUSH_SUBSCRIPTIONS : "subscribes"
    PROFILES ||--o| NOTIFICATION_PREFERENCES : "configures"
    TURFS ||--o{ REVIEWS : "reviewed"
    PROFILES ||--o{ REVIEWS : "writes"
    BOOKINGS ||--o| REVIEWS : "reviewed"
    PROFILES ||--o{ AUDIT_LOGS : "acts"

    PROFILES {
        uuid id PK
        varchar email UK
        platform_role platform_role
        varchar full_name
        varchar phone
        boolean is_active
    }
    TENANTS {
        uuid id PK
        varchar name
        varchar slug UK
        tenant_status status
        uuid city_id FK
    }
    TENANT_MEMBERS {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        tenant_role role
    }
    CITIES {
        uuid id PK
        varchar slug UK
        varchar timezone
        geography center
    }
    LOCATIONS {
        uuid id PK
        uuid tenant_id FK
        geography geog "gist indexed"
    }
    TURFS {
        uuid id PK
        uuid tenant_id FK
        uuid location_id FK
        bigint base_price_minor
        cancellation_policy policy
        turf_status status
    }
    TURF_SLOTS {
        uuid id PK
        uuid turf_id FK
        timestamptz starts_at
        timestamptz ends_at
        bigint price_minor
        slot_status status
        uuid booking_id
        timestamptz reservation_expires_at
    }
    BOOKINGS {
        uuid id PK
        varchar reference UK
        uuid tenant_id FK
        uuid turf_id FK
        uuid customer_id FK
        booking_status booking_status
        payment_method payment_method
        bigint total_amount_minor
        bigint paid_amount_minor
        bigint refunded_amount_minor
        varchar idempotency_key "UNIQUE with customer_id"
        timestamptz reservation_expires_at
    }
    BOOKING_ITEMS {
        uuid id PK
        uuid booking_id FK
        uuid slot_id FK "UNIQUE — anti double-booking"
        bigint price_minor
    }
    PAYMENTS {
        uuid id PK
        uuid booking_id FK
        varchar provider_order_id UK
        varchar provider_payment_id
        payment_status status
        bigint amount_minor
    }
    PAYMENT_EVENTS {
        uuid id PK
        varchar event_id "UNIQUE per provider — idempotency"
        boolean signature_verified
        jsonb payload
    }
    REFUNDS {
        uuid id PK
        uuid payment_id FK
        bigint amount_minor
        refund_status status
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        notification_kind kind
    }
    NOTIFICATION_JOBS {
        uuid id PK
        uuid notification_id FK
        notification_channel channel
        varchar idempotency_key UK
        smallint attempts
    }
    REVIEWS {
        uuid id PK
        uuid turf_id FK
        uuid booking_id FK UK
        smallint rating
    }
    AUDIT_LOGS {
        uuid id PK
        uuid actor_id FK
        varchar action
        varchar entity_type
        jsonb before
        jsonb after
    }
```

## Integrity guarantees worth calling out

| Guarantee | Mechanism |
|---|---|
| A slot is claimed by at most one booking, ever | `booking_items.slot_id` UNIQUE |
| No two overlapping active slots per turf | exclusion constraint `turf_slots_no_overlap` (GiST: `turf_id` =, period `&&`) |
| Reserved/booked slots always reference a booking | CHECK `(status IN ('reserved','booked')) = (booking_id IS NOT NULL)` |
| Turf belongs to its location's tenant | CHECK via `tenant_location_matches()` |
| A customer cannot double-submit a booking | UNIQUE `(customer_id, idempotency_key)` |
| Webhook processed once | UNIQUE `(provider, event_id)` on `payment_events` |
| Money never negative / refund ≤ paid / paid ≤ total | CHECK constraints on `bookings` |
| Bookings only confirm with payment or pay-at-venue | CHECK `bookings_paid_amount_chk` |
| Tenant isolation | RLS policies + `has_tenant_role()` helpers + service-layer guards |
