import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { createReviewSchema } from "@turf/validation";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { TenantCtx, TenantRoles } from "../common/decorators/tenant-roles.decorator.js";
import { TenantMemberGuard } from "../common/guards/tenant-member.guard.js";
import { Public } from "../common/guards/public.decorator.js";
import type { AuthenticatedUser } from "@turf/shared-types";
import { ReviewsService } from "./reviews.service.js";

const moderateSchema = z.object({ status: z.enum(["published", "hidden"]) });

@ApiTags("reviews")
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post("reviews")
  @ApiOperation({ summary: "Review a completed booking (customer, once per booking)" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(createReviewSchema) input: z.infer<typeof createReviewSchema>,
    @Req() req: Request,
  ) {
    return this.reviews.create(user.id, input, req.requestId);
  }

  @Public()
  @Get("turfs/:turfId/reviews")
  @ApiOperation({ summary: "Published reviews for a turf" })
  list(@Param("turfId", ParseUUIDPipe) turfId: string) {
    return this.reviews.listForTurf(turfId);
  }

  @Patch("tenants/:tenantId/reviews/:reviewId/moderation")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Hide or publish a review (manager+)" })
  moderate(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("reviewId", ParseUUIDPipe) reviewId: string,
    @ZodBody(moderateSchema) input: z.infer<typeof moderateSchema>,
    @Req() req: Request,
  ) {
    return this.reviews.moderate(ctx.tenantId, user.id, reviewId, input.status, req.requestId);
  }
}
