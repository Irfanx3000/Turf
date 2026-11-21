/**
 * Payment gateway abstraction.
 *
 * RazorpayProvider is the production adapter (REST API + webhook signatures).
 * MockProvider is a deterministic development gateway: same contract, no
 * network. The API reports the active provider on /health and never claims a
 * payment succeeded without a verified event from the active provider.
 */
export interface CreateOrderInput {
  amountMinor: number;
  currency: "INR";
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  provider: "razorpay" | "mock";
  orderId: string;
  keyId: string | null;
  checkoutToken: string | null;
}

export type ProviderPaymentStatus = "pending" | "paid" | "failed";

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  orderId: string | null;
  paymentId: string | null;
  status: ProviderPaymentStatus;
  amountMinor: number | null;
}

export interface ProviderStatus {
  orderId: string;
  status: ProviderPaymentStatus;
  paymentId: string | null;
  amountMinor: number | null;
}

export interface PaymentProvider {
  readonly name: "razorpay" | "mock";
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  /** Constant-time HMAC verification of the raw request body. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  /** Parses (does NOT verify) the webhook payload. */
  parseWebhookEvent(rawBody: string): WebhookEvent;
  /** Reconciliation: authoritative order status from the gateway. */
  fetchOrderStatus(orderId: string): Promise<ProviderStatus>;
}
