import { Resend } from "resend";
import { ENV } from "../../config/configuration.js";
import type { EmailProvider, SendEmailInput } from "../email-provider.js";

/**
 * Production email via Resend. Requires RESEND_API_KEY and a verified
 * EMAIL_FROM domain (or Resend's onboarding@resend.dev for sandbox tests).
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;
  private client: Resend;

  constructor(apiKey = ENV.RESEND_API_KEY) {
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    }
    this.client = new Resend(apiKey);
  }

  async send(input: SendEmailInput): Promise<{ id: string }> {
    const { data, error } = await this.client.emails.send(
      {
        from: ENV.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    if (error) {
      throw new Error(error.message);
    }
    if (!data?.id) {
      throw new Error("resend returned no email id");
    }
    return { id: data.id };
  }
}
