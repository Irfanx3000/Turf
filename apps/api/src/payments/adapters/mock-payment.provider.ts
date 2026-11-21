import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ENV } from "../../config/configuration.js";
import type {
  CreateOrderInput, CreateOrderResult, PaymentProvider, ProviderStatus, WebhookEvent,
} from "./payment-provider.js";

const MOCK_SECRET = ENV.PAYMENT_MOCK_SECRET ?? "mock-webhook-secret";

/** Dev-only in-memory state of "captured" mock orders. */
const mockCaptured = new Map<string, { paymentId: string; amountMinor: number }>();

export function mockCapture(orderId: string, amountMinor: number): { paymentId: string } {
  const paymentId = `mock_pay_${randomUUID()}`;
  mockCaptured.set(orderId, { paymentId, amountMinor });
  return { paymentId };
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    return {
      provider: "mock",
      orderId: `mock_order_${randomUUID()}`,
      keyId: null,
      checkoutToken: `mock_checkout_${randomUUID()}`,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;
    const expected = createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Signs a mock webhook payload the same way the mock verifier expects. */
  signWebhookPayload(rawBody: string): string {
    return createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex");
  }

  parseWebhookEvent(rawBody: string): WebhookEvent {
    const payload = JSON.parse(rawBody) as {
      eventId?: string; event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } };
    };
    const entity = payload.payload?.payment?.entity;
    return {
      eventId: payload.eventId ?? `mock_evt_${randomUUID()}`,
      eventType: payload.event ?? "unknown",
      orderId: entity?.order_id ?? null,
      paymentId: entity?.id ?? null,
      status: entity?.status === "captured" ? "paid" : entity?.status === "failed" ? "failed" : "pending",
      amountMinor: entity?.amount ?? null,
    };
  }

  async fetchOrderStatus(orderId: string): Promise<ProviderStatus> {
    const captured = mockCaptured.get(orderId);
    return {
      orderId,
      status: captured ? "paid" : "pending",
      paymentId: captured?.paymentId ?? null,
      amountMinor: captured?.amountMinor ?? null,
    };
  }
}
