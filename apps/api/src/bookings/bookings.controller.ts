import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { cancelBookingSchema, createBookingSchema, pagination } from "@turf/validation";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { ZodQuery as ZQ } from "../common/decorators/zod-query.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Public } from "../common/guards/public.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { TenantCtx } from "../common/decorators/tenant-roles.decorator.js";
import { TenantMemberGuard } from "../common/guards/tenant-member.guard.js";
import type { AuthenticatedUser } from "@turf/shared-types";
import { BookingsService } from "./bookings.service.js";

const listQuery = pagination.extend({ status: z.string().max(20).optional() });

@ApiTags("bookings")
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post("bookings")
  @ApiOperation({ summary: "Create a booking (atomic slot claim; idempotent via idempotencyKey)" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(createBookingSchema) input: z.infer<typeof createBookingSchema>,
    @Req() req: Request,
  ) {
    return this.bookings.create(user, input, req.requestId);
  }

  @Get("bookings/mine")
  @ApiOperation({ summary: "Customer booking history" })
  mine(@CurrentUser() user: AuthenticatedUser, @ZQ(listQuery) query: z.infer<typeof listQuery>) {
    return this.bookings.listForCustomer(user.id, query.page, query.pageSize, query.status);
  }

  @Get("bookings/:bookingId")
  @ApiOperation({ summary: "Booking detail (customer own, tenant member, or super admin)" })
  get(@CurrentUser() user: AuthenticatedUser, @Param("bookingId", ParseUUIDPipe) bookingId: string) {
    return this.bookings.getForActor(bookingId, user);
  }

  @Get("bookings/:bookingId/history")
  @ApiOperation({ summary: "Booking status history (same access rules)" })
  history(@CurrentUser() user: AuthenticatedUser, @Param("bookingId", ParseUUIDPipe) bookingId: string) {
    return this.bookings.historyFor(bookingId);
  }

  @Post("bookings/:bookingId/cancel")
  @ApiOperation({ summary: "Cancel a booking; explicit refund policy applies" })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookingId", ParseUUIDPipe) bookingId: string,
    @ZodBody(cancelBookingSchema) input: z.infer<typeof cancelBookingSchema>,
    @Req() req: Request,
  ) {
    return this.bookings.cancel(bookingId, user, input.reason, req.requestId);
  }

  /* tenant views */
  @Post("tenants/:tenantId/bookings/:bookingId/no-show")
  @UseGuards(TenantMemberGuard)
  @ApiOperation({ summary: "Mark a confirmed booking as no-show (staff+)" })
  markNoShow(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookingId", ParseUUIDPipe) bookingId: string,
    @Req() req: Request,
  ) {
    return this.bookings.markNoShow(ctx.tenantId, user.id, bookingId, req.requestId);
  }

  @Get("tenants/:tenantId/bookings")
  @UseGuards(TenantMemberGuard)
  @ApiOperation({ summary: "Tenant bookings (staff+, filters + date range)" })
  listForTenant(
    @TenantCtx() ctx: { tenantId: string },
    @ZQ(listQuery.extend({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }))
    query: z.infer<ReturnType<typeof listQuery.extend>>,
  ) {
    return this.bookings.listForTenant(
      ctx.tenantId,
      query.page, query.pageSize, query.status,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }
}
