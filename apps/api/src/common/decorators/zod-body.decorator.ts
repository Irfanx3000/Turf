import { Body } from "@nestjs/common";
import type { ZodType } from "zod";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe.js";

/**
 * @ZodBody(schema) — parameter decorator: the body is validated by the Zod
 * pipe and the parameter receives the PARSED value.
 */
export function ZodBody<T>(schema: ZodType<T>) {
  return Body(new ZodValidationPipe(schema));
}
