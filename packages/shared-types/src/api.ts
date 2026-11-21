import type {
  BookingStatus, PaymentMethod, PaymentStatus, PlatformRole, TenantRole, TenantStatus, TurfStatus,
} from "./enums.js";

/** Envelope for every list endpoint. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  errorCode: string;
  requestId: string;
  timestamp: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  platformRole: PlatformRole;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  /** Tenants the user belongs to (empty for plain customers). */
  memberships: Array<{ tenantId: string; tenantName: string; role: TenantRole }>;
}

export interface GeoPoint { lat: number; lng: number; }

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  logoUrl: string | null;
  city: string | null;
}

export interface TurfCard {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  cityName: string;
  areaName: string | null;
  sports: string[];
  heroImageUrl: string | null;
  basePriceMinor: number;
  currency: "INR";
  ratingAvg: number | null;
  ratingCount: number;
  distanceMeters: number | null;
  location: GeoPoint;
}

export interface TurfDetail extends TurfCard {
  tenantId: string;
  description: string | null;
  amenities: string[];
  images: Array<{ id: string; url: string; alt: string | null; sortOrder: number }>;
  operatingHours: Array<{ day: string; opensAt: string; closesAt: string; closed: boolean }>;
  cancellationPolicy: string;
  payAtVenueAllowed: boolean;
}

export interface SlotView {
  id: string;
  startsAt: string; // ISO 8601 UTC
  endsAt: string;
  priceMinor: number;
  status: "available" | "reserved" | "booked" | "blocked";
}

export interface PriceQuote {
  turfId: string;
  slotIds: string[];
  currency: "INR";
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  breakdown: Array<{ label: string; amountMinor: number }>;
  quoteId: string;
  expiresAt: string;
}

export interface BookingSummary {
  id: string;
  reference: string;
  turfId: string;
  turfName: string;
  turfSlug: string;
  startsAt: string;
  endsAt: string;
  totalAmountMinor: number;
  paidAmountMinor: number;
  currency: "INR";
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
}

export interface CreateBookingResponse {
  booking: BookingSummary;
  /** Present for online payments: the client hands this to the gateway widget. */
  payment?: {
    orderId: string;
    provider: "razorpay" | "mock";
    keyId: string | null;
    amountMinor: number;
    currency: "INR";
    checkoutToken: string | null;
  };
  /** When the temporary reservation auto-expires if unpaid. */
  reservationExpiresAt: string | null;
}
