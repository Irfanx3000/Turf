import { Query } from "@nestjs/common";
import type { ZodType } from "zod";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe.js";

/** @ZodQuery(schema) — validated query string; parameter gets the parsed value. */
export function ZodQuery<T>(schema: ZodType<T>) {
  return Query(new ZodValidationPipe(schema));
}
