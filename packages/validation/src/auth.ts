import { z } from "zod";
import { phone } from "./common.js";

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z
    .string()
    .min(10, "at least 10 characters")
    .max(128)
    .regex(/[a-z]/, "needs a lowercase letter")
    .regex(/[A-Z]/, "needs an uppercase letter")
    .regex(/[0-9]/, "needs a number"),
  fullName: z.string().min(2).max(120),
  phone: phone.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const registerOwnerSchema = registerSchema.extend({
  organizationName: z.string().min(2).max(160),
  city: z.string().min(2).max(80),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: phone.optional(),
  avatarUrl: z.string().url().optional(),
});
