import { Body, Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { Public } from "../common/guards/public.decorator.js";
import { PricingService } from "./pricing.service.js";

const quoteSchema = z.object({ slotIds: z.array(z.string().uuid()).min(1).max(20) });

@ApiTags("pricing")
@Controller("turfs")
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @Post(":turfId/quote")
  @ApiOperation({ summary: "Server-computed price quote for selected slots (advisory)" })
  quote(@Param("turfId", ParseUUIDPipe) turfId: string, @ZodBody(quoteSchema) input: z.infer<typeof quoteSchema>) {
    return this.pricing.quote(turfId, input.slotIds);
  }
}
