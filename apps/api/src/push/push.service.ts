import { Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "@turf/db";
import { DbService } from "../database/db-tokens.js";
import { ENV } from "../config/configuration.js";
import { logger } from "../common/logging/logger.service.js";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Web Push delivery. VAPID keys are REQUIRED for real delivery; without them
 * the adapter logs payloads instead and /health reports push as unavailable.
 * Push delivery is best-effort by nature — the canonical state lives in the
 * database, never in push receipts.
 */
@Injectable()
export class PushService {
  private readonly nestLogger = new Logger(PushService.name);
  private webpush: typeof import("web-push") | null = null;
  readonly available: boolean;

  constructor(private readonly db: DbService) {
    this.available = Boolean(ENV.VAPID_PUBLIC_KEY && ENV.VAPID_PRIVATE_KEY);
    if (this.available) {
      // Loaded lazily to keep startup cheap when push is not configured.
      import("web-push")
        .then((mod) => {
          mod.default.setVapidDetails(ENV.VAPID_SUBJECT, ENV.VAPID_PUBLIC_KEY!, ENV.VAPID_PRIVATE_KEY!);
          this.webpush = mod.default;
        })
        .catch((err) => this.nestLogger.warn(`web-push failed to load: ${err.message}`));
    }
  }

  async subscribe(
    userId: string,
    input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string },
  ): Promise<{ subscribed: true }> {
    await this.db.service
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent?.slice(0, 400),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, lastSeenAt: new Date() },
      });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<{ unsubscribed: true }> {
    await this.db.service
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
    return { unsubscribed: true };
  }

  /** Best-effort fan-out to a user's subscriptions. Never throws. */
  async sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
    const subs = await this.db.service
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    let sent = 0;
    let failed = 0;

    for (const sub of subs) {
      if (!this.webpush) {
        logger.info({ userId, title: payload.title }, "[push:dev] VAPID not configured — payload logged, not delivered");
        break;
      }
      try {
        await this.webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: subscription is gone — remove it.
        if (status === 404 || status === 410) {
          await this.db.service.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
        } else {
          logger.warn({ err, endpoint: sub.endpoint.slice(0, 60) }, "push delivery failed");
        }
      }
    }
    return { sent, failed };
  }

  /** VAPID public key for the browser's pushManager.subscribe call. */
  vapidPublicKey(): string | null {
    return ENV.VAPID_PUBLIC_KEY ?? null;
  }
}
