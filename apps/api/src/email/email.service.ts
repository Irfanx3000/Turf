import { Injectable } from "@nestjs/common";
import { ENV } from "../config/configuration.js";
import { logger } from "../common/logging/logger.service.js";
import type { EmailProvider, SendEmailInput } from "./email-provider.js";
import { MockEmailProvider } from "./adapters/mock-email.provider.js";
import { ResendEmailProvider } from "./adapters/resend-email.provider.js";

@Injectable()
export class EmailService {
  private readonly provider: EmailProvider;

  constructor() {
    this.provider = createEmailProvider();
    logger.info({ provider: this.provider.name }, "email provider ready");
  }

  get providerName(): EmailProvider["name"] {
    return this.provider.name;
  }

  send(input: SendEmailInput): Promise<{ id: string }> {
    return this.provider.send(input);
  }

  async sendPasswordReset(input: {
    to: string;
    fullName: string | null;
    resetUrl: string;
    requestId: string;
  }): Promise<void> {
    const name = input.fullName?.trim() || "there";
    const subject = `Reset your ${ENV.PLATFORM_NAME} password`;
    const text = [
      `Hi ${name},`,
      "",
      `We received a request to reset your ${ENV.PLATFORM_NAME} password.`,
      "Open this link to choose a new password (expires in 1 hour):",
      input.resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
      "",
      `— ${ENV.PLATFORM_NAME}`,
    ].join("\n");

    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5; color: #202923;">
        <p>Hi ${escapeHtml(name)},</p>
        <p>We received a request to reset your <strong>${escapeHtml(ENV.PLATFORM_NAME)}</strong> password.</p>
        <p>
          <a href="${escapeHtml(input.resetUrl)}"
             style="display:inline-block;background:#176B4D;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600;">
            Reset password
          </a>
        </p>
        <p style="color:#737D76;font-size:14px;">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
        <p style="color:#737D76;font-size:12px;">Or paste this URL:<br/>${escapeHtml(input.resetUrl)}</p>
      </div>
    `.trim();

    await this.send({
      to: input.to,
      subject,
      html,
      text,
      idempotencyKey: `password-reset/${input.requestId}/${input.to}`,
    });
  }
}

function createEmailProvider(): EmailProvider {
  switch (ENV.EMAIL_PROVIDER) {
    case "resend":
      return new ResendEmailProvider();
    case "smtp":
      logger.warn("EMAIL_PROVIDER=smtp is not implemented yet — falling back to mock (messages are logged, not delivered)");
      return new MockEmailProvider();
    case "mock":
      return new MockEmailProvider();
    default: {
      const _exhaustive: never = ENV.EMAIL_PROVIDER;
      return _exhaustive;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
