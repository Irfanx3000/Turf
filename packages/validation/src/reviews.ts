import { z } from "zod";
import { uuid } from "./common.js";

export const createReviewSchema = z.object({
  turfId: uuid,
  bookingId: uuid,
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
});
