import { randomUUID } from "node:crypto";
import { logger } from "../../common/logging/logger.service.js";
import type { EmailProvider, SendEmailInput } from "../email-provider.js";

/**
 * Dev/default adapter: never claims delivery. Logs the full payload
 * (including reset links) so local flows are exercisable without SMTP/Resend.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock" as const;

  async send(input: SendEmailInput): Promise<{ id: string }> {
    const id = `mock_email_${randomUUID()}`;
    logger.info(
      {
        emailId: id,
        to: input.to,
        subject: input.subject,
        text: input.text,
        idempotencyKey: input.idempotencyKey,
      },
      "email mock: message logged (not delivered)",
    );
    return { id };
  }
}
