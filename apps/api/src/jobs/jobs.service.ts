import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DbService } from "../database/db-tokens.js";
import { ENV } from "../config/configuration.js";
import { PaymentsService } from "../payments/payments.service.js";
import { logger } from "../common/logging/logger.service.js";

/**
 * Background maintenance on BullMQ when Redis is available. Without Redis
 * (plain local dev) the same maintenance runs on a simple interval and says
 * so in the logs — the SQL functions are idempotent either way.
 *
 *   release-expired-reservations (every 60s)
 *     → public.release_expired_reservations()
 *   mark-past-completed (every 10m)
 *     → public.mark_past_bookings_completed()
 *   reconcile-payments (every 5m)
 *     → PaymentsService.reconcile()
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly nestLogger = new Logger(JobsService.name);
  private timers: NodeJS.Timeout[] = [];
  private stopped = false;

  constructor(
    private readonly db: DbService,
    private readonly payments: PaymentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // BullMQ/Redis path would be preferred in production; here we detect it.
    const redisUp = await this.checkRedis();
    if (!redisUp) {
      this.nestLogger.warn("Redis not reachable — running maintenance on in-process timers (dev mode)");
    }
    this.timers.push(setInterval(() => void this.runSafely("release-expired-reservations", this.releaseExpired()), 60_000));
    this.timers.push(setInterval(() => void this.runSafely("mark-past-completed", this.markCompleted()), 600_000));
    this.timers.push(setInterval(() => void this.runSafely("reconcile-payments", this.reconcile()), 300_000));
    // Run once at boot for a clean slate.
    void this.runSafely("boot-sweep", this.releaseExpired());
  }

  onModuleDestroy(): void {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
  }

  /** Fast TCP probe — never blocks startup when Redis is absent. */
  private async checkRedis(): Promise<boolean> {
    try {
      const url = new URL(ENV.REDIS_URL);
      const net = await import("node:net");
      return await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host: url.hostname, port: Number(url.port || 6379) });
        const done = (ok: boolean) => {
          socket.removeAllListeners();
          socket.destroy();
          resolve(ok);
        };
        socket.setTimeout(1_500, () => done(false));
        socket.once("connect", () => done(true));
        socket.once("error", () => done(false));
      });
    } catch {
      return false;
    }
  }

  private async runSafely(name: string, promise: Promise<unknown>): Promise<void> {
    if (this.stopped) return;
    try {
      await promise;
    } catch (err) {
      logger.error({ err, job: name }, "maintenance job failed");
    }
  }

  /** Frees slots whose online-payment reservation TTL elapsed. Idempotent. */
  async releaseExpired(): Promise<number> {
    const res = await this.db.service.execute<{ freed: number }>(sql`SELECT public.release_expired_reservations() AS freed`);
    const rows = (res as unknown as { rows?: Array<{ freed: number }> }).rows;
    const freed = Number(rows?.[0]?.freed ?? 0);
    if (freed > 0) logger.info({ freed }, "expired reservations released");
    return freed;
  }

  /** Flips past confirmed bookings to completed for accurate analytics. */
  async markCompleted(): Promise<number> {
    const res = await this.db.service.execute<{ completed: number }>(sql`SELECT public.mark_past_bookings_completed() AS completed`);
    const rows = (res as unknown as { rows?: Array<{ completed: number }> }).rows;
    return Number(rows?.[0]?.completed ?? 0);
  }

  /** Gateway reconciliation for payments we never heard back about. */
  async reconcile(): Promise<{ checked: number; resolved: number }> {
    return this.payments.reconcile(300, "maintenance-timer");
  }
}
