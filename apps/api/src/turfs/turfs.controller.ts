import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { createTurfSchema, nearbySearchSchema, operatingHoursSchema, pagination } from "@turf/validation";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { ZodQuery } from "../common/decorators/zod-query.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { TenantCtx, TenantRoles } from "../common/decorators/tenant-roles.decorator.js";
import { TenantMemberGuard } from "../common/guards/tenant-member.guard.js";
import { Public } from "../common/guards/public.decorator.js";
import type { AuthenticatedUser } from "@turf/shared-types";
import { TurfsService } from "./turfs.service.js";

const browseSchema = pagination.extend({
  city: z.string().max(80).optional(),
  sport: z.string().max(40).optional(),
  search: z.string().max(120).optional(),
  maxPriceMinor: z.coerce.number().int().min(0).optional(),
});

const imagesSchema = z.object({
  images: z.array(z.object({ url: z.string().url(), alt: z.string().max(200).optional() })).max(20),
});

const sportsSchema = z.object({ sportIds: z.array(z.string().uuid()).min(1) });
const amenitiesSchema = z.object({ amenityIds: z.array(z.string().uuid()) });
const availabilityQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

@ApiTags("turfs")
@Controller()
export class TurfsController {
  constructor(private readonly turfs: TurfsService) {}

  /* public discovery */
  @Public()
  @Get("turfs")
  @ApiOperation({ summary: "Browse published turfs (filters: city, sport, search, max price)" })
  browse(@ZodQuery(browseSchema) query: z.infer<typeof browseSchema>) {
    return this.turfs.browse(query);
  }

  @Public()
  @Get("turfs/nearby")
  @ApiOperation({ summary: "Nearby search with PostGIS distance ranking" })
  nearby(@ZodQuery(nearbySearchSchema) query: z.infer<typeof nearbySearchSchema>) {
    return this.turfs.nearby(query);
  }

  @Public()
  @Get("turfs/:slug")
  @ApiOperation({ summary: "Turf detail by slug" })
  detail(@Param("slug") slug: string) {
    return this.turfs.getBySlug(slug);
  }

  @Public()
  @Get("turfs/:slug/availability")
  @ApiOperation({ summary: "Slot availability for one venue-local date" })
  availability(@Param("slug") slug: string, @ZodQuery(availabilityQuery) query: z.infer<typeof availabilityQuery>) {
    return this.turfs.availability(slug, query.date);
  }

  @Public()
  @Get("turfs/id/:turfId/availability")
  @ApiOperation({ summary: "Slot availability by turf id (used by the booking review step)" })
  availabilityById(
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodQuery(availabilityQuery) query: z.infer<typeof availabilityQuery>,
  ) {
    return this.turfs.availabilityById(turfId, query.date);
  }

  /* tenant management */
  @Get("tenants/:tenantId/turfs")
  @UseGuards(TenantMemberGuard)
  @ApiOperation({ summary: "List tenant turfs incl. drafts (staff+)" })
  listForTenant(@TenantCtx() ctx: { tenantId: string }) {
    return this.turfs.listForTenant(ctx.tenantId);
  }

  @Post("tenants/:tenantId/turfs")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Create a turf at one of the tenant's locations (manager+)" })
  create(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(createTurfSchema) input: z.infer<typeof createTurfSchema>,
    @Req() req: Request,
  ) {
    return this.turfs.create(ctx.tenantId, user.id, input, req.requestId);
  }

  @Get("tenants/:tenantId/turfs/:turfId")
  @UseGuards(TenantMemberGuard)
  @ApiOperation({ summary: "Turf detail for staff (staff+)" })
  getForTenant(@TenantCtx() ctx: { tenantId: string }, @Param("turfId", ParseUUIDPipe) turfId: string) {
    return this.turfs.getForTenant(ctx.tenantId, turfId);
  }

  @Patch("tenants/:tenantId/turfs/:turfId")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Update turf attributes (manager+)" })
  update(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(createTurfSchema.partial()) input: z.infer<ReturnType<typeof createTurfSchema.partial>>,
    @Req() req: Request,
  ) {
    return this.turfs.update(ctx.tenantId, user.id, turfId, input, req.requestId);
  }

  @Patch("tenants/:tenantId/turfs/:turfId/status")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Publish / draft / archive a turf (manager+)" })
  updateStatus(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @Body() body: { status: "draft" | "published" | "archived" },
    @Req() req: Request,
  ) {
    return this.turfs.updateStatus(ctx.tenantId, user.id, turfId, body.status, req.requestId);
  }

  @Put("tenants/:tenantId/turfs/:turfId/images")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("staff")
  @ApiOperation({ summary: "Replace turf gallery (staff+)" })
  setImages(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(imagesSchema) input: z.infer<typeof imagesSchema>,
    @Req() req: Request,
  ) {
    return this.turfs.setImages(ctx.tenantId, user.id, turfId, input.images, req.requestId);
  }

  @Put("tenants/:tenantId/turfs/:turfId/sports")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  setSports(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(sportsSchema) input: z.infer<typeof sportsSchema>,
    @Req() req: Request,
  ) {
    return this.turfs.setSports(ctx.tenantId, user.id, turfId, input.sportIds, req.requestId);
  }

  @Put("tenants/:tenantId/turfs/:turfId/amenities")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("staff")
  setAmenities(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(amenitiesSchema) input: z.infer<typeof amenitiesSchema>,
    @Req() req: Request,
  ) {
    return this.turfs.setAmenities(ctx.tenantId, user.id, turfId, input.amenityIds, req.requestId);
  }

  @Put("tenants/:tenantId/turfs/:turfId/operating-hours")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Set weekly operating hours (manager+)" })
  setOperatingHours(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(operatingHoursSchema) input: z.infer<typeof operatingHoursSchema>,
    @Req() req: Request,
  ) {
    return this.turfs.setOperatingHours(ctx.tenantId, user.id, turfId, input, req.requestId);
  }
}
