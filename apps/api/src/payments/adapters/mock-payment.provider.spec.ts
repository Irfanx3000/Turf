import { describe, expect, it } from "vitest";
import { MockPaymentProvider, mockCapture } from "./mock-payment.provider.js";

const provider = new MockPaymentProvider();

describe("MockPaymentProvider (dev gateway)", () => {
  it("verifies a correctly signed webhook over the raw body", () => {
    const raw = JSON.stringify({ eventId: "evt_1", event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 50000, status: "captured" } } } });
    const signature = provider.signWebhookPayload(raw);
    expect(provider.verifyWebhookSignature(raw, signature)).toBe(true);
  });

  it("rejects a signature computed over different bytes (tampered body)", () => {
    const raw = JSON.stringify({ eventId: "evt_1", event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 50000, status: "captured" } } } });
    const signature = provider.signWebhookPayload(raw);
    const tampered = raw.replace("50000", "999999");
    expect(provider.verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it("rejects missing signatures", () => {
    expect(provider.verifyWebhookSignature("{}", null)).toBe(false);
    expect(provider.verifyWebhookSignature("{}", "")).toBe(false);
  });

  it("parses captured events with explicit and derived event ids", () => {
    const parsed = provider.parseWebhookEvent(
      JSON.stringify({ eventId: "evt_explicit", event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 50000, status: "captured" } } } }),
    );
    expect(parsed).toMatchObject({ eventId: "evt_explicit", eventType: "payment.captured", orderId: "order_1", status: "paid", amountMinor: 50000 });
  });

  it("creates distinct order ids (UNIQUE provider_order_id safe)", async () => {
    const a = await provider.createOrder({ amountMinor: 1000, currency: "INR", receipt: "R1", notes: {} });
    const b = await provider.createOrder({ amountMinor: 1000, currency: "INR", receipt: "R2", notes: {} });
    expect(a.orderId).not.toBe(b.orderId);
    expect(a.provider).toBe("mock");
  });

  it("reports captured orders as paid via fetchOrderStatus", async () => {
    const order = await provider.createOrder({ amountMinor: 25000, currency: "INR", receipt: "R3", notes: {} });
    expect((await provider.fetchOrderStatus(order.orderId)).status).toBe("pending");
    mockCapture(order.orderId, 25000);
    const status = await provider.fetchOrderStatus(order.orderId);
    expect(status.status).toBe("paid");
    expect(status.amountMinor).toBe(25000);
  });
});
