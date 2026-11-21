import { z } from "zod";
import { NOTIFICATION_CHANNELS } from "@turf/shared-types";


export const updateNotificationPreferencesSchema = z.object({
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(0).max(4),
  bookingReminders: z.boolean(),
  marketing: z.boolean(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(400).optional(),
});
