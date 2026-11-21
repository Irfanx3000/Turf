import { razorpayActive } from "../../config/configuration.js";
import { MockPaymentProvider } from "./mock-payment.provider.js";
import { RazorpayProvider } from "./razorpay.provider.js";
import type { PaymentProvider } from "./payment-provider.js";

let provider: PaymentProvider | undefined;

/** Single active payment provider; reported by /health. */
export function paymentProvider(): PaymentProvider {
  if (!provider) {
    provider = razorpayActive() ? new RazorpayProvider() : new MockPaymentProvider();
  }
  return provider;
}

export function resetPaymentProvider(): void {
  provider = undefined;
}
