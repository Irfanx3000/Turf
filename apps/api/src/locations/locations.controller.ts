import { Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { createLocationSchema } from "@turf/validation";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { TenantCtx, TenantRoles } from "../common/decorators/tenant-roles.decorator.js";
import { TenantMemberGuard } from "../common/guards/tenant-member.guard.js";

import type { AuthenticatedUser } from "@turf/shared-types";
import { LocationsService } from "./locations.service.js";

const updateLocationSchema = createLocationSchema.partial().omit({ location: true });

@ApiTags("locations")
@Controller("tenants/:tenantId/locations")
@UseGuards(TenantMemberGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @ApiOperation({ summary: "List tenant locations (staff+)" })
  list(@TenantCtx() ctx: { tenantId: string }) {
    return this.locations.list(ctx.tenantId);
  }

  @Post()
  @TenantRoles("manager")
  @ApiOperation({ summary: "Create a location (manager+)" })
  create(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(createLocationSchema) input: z.infer<typeof createLocationSchema>,
    @Req() req: Request,
  ) {
    return this.locations.create(ctx.tenantId, user.id, input, req.requestId);
  }

  @Patch(":locationId")
  @TenantRoles("manager")
  @ApiOperation({ summary: "Update a location (manager+)" })
  update(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("locationId") locationId: string,
    @ZodBody(updateLocationSchema) input: z.infer<typeof updateLocationSchema>,
    @Req() req: Request,
  ) {
    return this.locations.update(ctx.tenantId, user.id, locationId, input, req.requestId);
  }

  @Delete(":locationId")
  @TenantRoles("owner")
  @ApiOperation({ summary: "Delete a location (owner)" })
  remove(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("locationId") locationId: string,
    @Req() req: Request,
  ) {
    return this.locations.remove(ctx.tenantId, user.id, locationId, req.requestId);
  }
}
