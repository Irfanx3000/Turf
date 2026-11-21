import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";
import type { ZodType } from "zod";

/** Validates a value against a Zod schema; result is the PARSED value. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        errorCode: "VALIDATION_ERROR",
        message: result.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`),
      });
    }
    return result.data;
  }
}
