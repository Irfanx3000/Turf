import { Controller, Get, Param, ParseUUIDPipe, Patch, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { Roles } from "../common/decorators/roles.decorator.js";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { ZodQuery } from "../common/decorators/zod-query.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { pagination } from "@turf/validation";
import type { AuthenticatedUser } from "@turf/shared-types";
import { AdminService } from "./admin.service.js";

const listQuery = pagination.extend({
  status: z.string().max(30).optional(),
  search: z.string().max(120).optional(),
  entityType: z.string().max(60).optional(),
  actorId: z.string().uuid().optional(),
});

const tenantActionSchema = z.object({
  action: z.enum(["verify", "suspend", "reactivate"]),
  reason: z.string().max(500).optional(),
});

const userActiveSchema = z.object({ isActive: z.boolean() });

@ApiTags("admin")
@Controller("admin")
@Roles("super_admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("dashboard")
  @ApiOperation({ summary: "Platform-wide metrics (super admin)" })
  dashboard() {
    return this.admin.dashboard();
  }

  @Get("tenants")
  @ApiOperation({ summary: "All tenants with turf counts" })
  tenants(@ZodQuery(listQuery) q: z.infer<typeof listQuery>) {
    return this.admin.listTenants(q.status);
  }

  @Patch("tenants/:tenantId/status")
  @ApiOperation({ summary: "Verify / suspend / reactivate a tenant" })
  tenantStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @ZodBody(tenantActionSchema) input: z.infer<typeof tenantActionSchema>,
    @Req() req: Request,
  ) {
    return this.admin.setTenantStatus(user.id, tenantId, input.action, input.reason, req.requestId);
  }

  @Get("users")
  @ApiOperation({ summary: "User directory (searchable)" })
  users(@ZodQuery(listQuery) q: z.infer<typeof listQuery>) {
    return this.admin.listUsers(q.search);
  }

  @Patch("users/:userId/status")
  @ApiOperation({ summary: "Enable / disable a user account" })
  userStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @ZodBody(userActiveSchema) input: z.infer<typeof userActiveSchema>,
    @Req() req: Request,
  ) {
    return this.admin.setUserActive(user.id, userId, input.isActive, req.requestId);
  }

  @Get("turfs")
  @ApiOperation({ summary: "All turfs across tenants" })
  turfs(@ZodQuery(listQuery) q: z.infer<typeof listQuery>) {
    return this.admin.listTurfs(q.status);
  }

  @Get("bookings")
  @ApiOperation({ summary: "All bookings (filter by status)" })
  bookings(@ZodQuery(listQuery) q: z.infer<typeof listQuery>) {
    return this.admin.listBookings(q.status);
  }

  @Get("payments")
  @ApiOperation({ summary: "All payments (filter by status)" })
  payments(@ZodQuery(listQuery) q: z.infer<typeof listQuery>) {
    return this.admin.listPayments(q.status);
  }

  @Get("audit-logs")
  @ApiOperation({ summary: "Audit trail (filter by entity/actor)" })
  auditTrail(@ZodQuery(listQuery) q: z.infer<typeof listQuery>) {
    return this.admin.listAuditLogs(q.entityType, q.actorId, q.page, q.pageSize);
  }
}
