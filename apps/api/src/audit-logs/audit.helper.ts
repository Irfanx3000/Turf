import { auditLogs } from "@turf/db";
import type { Db } from "@turf/db";
import { logger } from "../common/logging/logger.service.js";

export interface AuditEntry {
  actorId?: string;
  actorType?: "user" | "system" | "webhook";
  action: string;
  entityType: string;
  entityId?: string;
  tenantId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Fire-and-forget audit write for sensitive changes. Never throws into the
 * business flow; failures are logged loudly instead.
 */
export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: entry.actorId ?? null,
      actorType: entry.actorType ?? "user",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      tenantId: entry.tenantId ?? null,
      before: (entry.before ?? undefined) as never,
      after: (entry.after ?? undefined) as never,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent?.slice(0, 400) ?? null,
      requestId: entry.requestId ?? null,
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, "audit write failed");
  }
}
