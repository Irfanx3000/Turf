import { createHmac, timingSafeEqual } from "node:crypto";
import { razorpayActive } from "../../config/configuration.js";
import { ENV } from "../../config/configuration.js";
import type {
  CreateOrderInput, CreateOrderResult, PaymentProvider, ProviderStatus, WebhookEvent,
} from "./payment-provider.js";

const API = "https://api.razorpay.com/v1";

function authHeader(): string {
  const token = Buffer.from(`${ENV.RAZORPAY_KEY_ID}:${ENV.RAZORPAY_KEY_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;

  constructor() {
    if (!razorpayActive()) {
      throw new Error("RazorpayProvider requires RAZORPAY_KEY_ID, KEY_SECRET and WEBHOOK_SECRET");
    }
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader() },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes ?? {},
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`razorpay order creation failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { id: string };
    return { provider: "razorpay", orderId: data.id, keyId: ENV.RAZORPAY_KEY_ID!, checkoutToken: null };
  }

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!signature || !ENV.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = createHmac("sha256", ENV.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhookEvent(rawBody: string): WebhookEvent {
    const payload = JSON.parse(rawBody) as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } };
      /** Razorpay does not put a global event id in every payload; the payment
       *  entity id + event type is the stable idempotency key. */
    };
    const entity = payload.payload?.payment?.entity;
    const paymentId = entity?.id ?? null;
    return {
      eventId: `${payload.event ?? "unknown"}:${paymentId ?? "unknown"}`,
      eventType: payload.event ?? "unknown",
      orderId: entity?.order_id ?? null,
      paymentId,
      status: entity?.status === "captured" ? "paid" : entity?.status === "failed" ? "failed" : "pending",
      amountMinor: entity?.amount ?? null,
    };
  }

  async fetchOrderStatus(orderId: string): Promise<ProviderStatus> {
    const res = await fetch(`${API}/orders/${orderId}/payments`, {
      headers: { authorization: authHeader() },
    });
    if (!res.ok) {
      throw new Error(`razorpay status fetch failed (${res.status})`);
    }
    const data = (await res.json()) as {
      items?: Array<{ id: string; status: string; amount: number; order_id: string }>;
    };
    const captured = data.items?.find((p) => p.status === "captured" || p.status === "authorized");
    if (captured) {
      return { orderId, status: "paid", paymentId: captured.id, amountMinor: captured.amount };
    }
    const failed = data.items?.find((p) => p.status === "failed");
    if (failed) {
      return { orderId, status: "failed", paymentId: failed.id, amountMinor: failed.amount };
    }
    return { orderId, status: "pending", paymentId: null, amountMinor: null };
  }
}
