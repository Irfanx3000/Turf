export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable key so retries don't double-send (Resend idempotency). */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly name: "mock" | "resend" | "smtp";
  send(input: SendEmailInput): Promise<{ id: string }>;
}
