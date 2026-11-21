import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { isoDateTimeUtc } from "@turf/validation";
import { ZodQuery } from "../common/decorators/zod-query.decorator.js";
import { TenantCtx } from "../common/decorators/tenant-roles.decorator.js";
import { TenantMemberGuard } from "../common/guards/tenant-member.guard.js";
import { AnalyticsService } from "./analytics.service.js";

const rangeQuery = z.object({
  from: isoDateTimeUtc.optional(),
  to: isoDateTimeUtc.optional(),
});

@ApiTags("analytics")
@Controller("tenants/:tenantId/analytics")
@UseGuards(TenantMemberGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("overview")
  @ApiOperation({ summary: "Dashboard metrics: bookings, collections, occupancy (staff+)" })
  overview(
    @TenantCtx() ctx: { tenantId: string },
    @ZodQuery(rangeQuery) query: z.infer<typeof rangeQuery>,
  ) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    return this.analytics.overview(ctx.tenantId, from, to);
  }
}
