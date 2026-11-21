import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { notifications, notificationPreferences } from "@turf/db";
import { z } from "zod";
import { updateNotificationPreferencesSchema } from "@turf/validation";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { DbService } from "../database/db-tokens.js";
import type { AuthenticatedUser } from "@turf/shared-types";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly db: DbService) {}

  @Get("mine")
  @ApiOperation({ summary: "Own notifications, newest first" })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.db.service
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const unread = await this.db.service
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { items: rows, unreadCount: unread[0]?.count ?? 0 };
  }

  @Post(":id/read")
  @ApiOperation({ summary: "Mark one notification read" })
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.db.service
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
    return { read: true };
  }

  @Post("read-all")
  @ApiOperation({ summary: "Mark all own notifications read" })
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    await this.db.service
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { read: true };
  }

  @Get("preferences")
  @ApiOperation({ summary: "Own notification preferences" })
  async preferences(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.db.service
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id))
      .limit(1);
    if (rows.length === 0) {
      const [row] = await this.db.service
        .insert(notificationPreferences)
        .values({ userId: user.id })
        .returning();
      return row;
    }
    return rows[0];
  }

  @Put("preferences")
  @ApiOperation({ summary: "Update own notification preferences" })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(updateNotificationPreferencesSchema) input: z.infer<typeof updateNotificationPreferencesSchema>,
  ) {
    const [row] = await this.db.service
      .insert(notificationPreferences)
      .values({ userId: user.id, channels: input.channels, bookingReminders: input.bookingReminders, marketing: input.marketing })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { channels: input.channels, bookingReminders: input.bookingReminders, marketing: input.marketing, updatedAt: new Date() },
      })
      .returning();
    return row;
  }
}
