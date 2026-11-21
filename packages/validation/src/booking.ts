import { z } from "zod";
import { idempotencyKey, uuid } from "./common.js";

export const availabilitySchema = z.object({
  date: z.string().date(),
  sport: z.string().max(40).optional(),
});

export const createBookingSchema = z.object({
  turfId: uuid,
  slotIds: z.array(uuid).min(1).max(20),
  paymentMethod: z.enum(["online", "pay_at_venue"]),
  notes: z.string().max(500).optional(),
  idempotencyKey: idempotencyKey,
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const createPaymentOrderSchema = z.object({
  bookingId: uuid,
});

export const webhookEventSchema = z.object({
  event: z.string(),
  payload: z.object({ payment: z.object({ id: z.string(), entity: z.string().optional() }).passthrough() }).passthrough(),
});
