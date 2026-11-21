import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { createTenantSchema, inviteMemberSchema } from "@turf/validation";
import { z } from "zod";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { TenantCtx, TenantRoles } from "../common/decorators/tenant-roles.decorator.js";
import { TenantMemberGuard } from "../common/guards/tenant-member.guard.js";
import { UseGuards } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "@turf/shared-types";
import { TenantsService } from "./tenants.service.js";

const updateTenantSchema = createTenantSchema.partial();
const updateMemberRoleSchema = z.object({ role: z.enum(["owner", "manager", "staff"]) });

@ApiTags("tenants")
@Controller()
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post("tenants")
  @ApiOperation({ summary: "Create an organization (onboarding); caller becomes owner" })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(createTenantSchema) input: z.infer<typeof createTenantSchema>,
    @Req() req: Request,
  ) {
    return this.tenants.createForUser(user.id, input, req.requestId);
  }

  @Get("tenants/mine")
  @ApiOperation({ summary: "Organizations the caller belongs to" })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.tenants.listForUser(user.id);
  }

  @Get("tenants/:tenantId")
  @ApiOperation({ summary: "Tenant summary" })
  get(@Param("tenantId") tenantId: string) {
    return this.tenants.get(tenantId);
  }

  @Patch("tenants/:tenantId")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Update tenant profile (manager+)" })
  update(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(updateTenantSchema) input: z.infer<typeof updateTenantSchema>,
    @Req() req: Request,
  ) {
    return this.tenants.update(ctx.tenantId, user.id, input, req.requestId);
  }

  @Get("tenants/:tenantId/members")
  @UseGuards(TenantMemberGuard)
  @ApiOperation({ summary: "List members (staff+)" })
  members(@TenantCtx() ctx: { tenantId: string }) {
    return this.tenants.listMembers(ctx.tenantId);
  }

  @Post("tenants/:tenantId/members")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Add an existing user as member (manager+)" })
  addMember(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(inviteMemberSchema) input: z.infer<typeof inviteMemberSchema>,
    @Req() req: Request,
  ) {
    return this.tenants.addMember(ctx.tenantId, user.id, input.email, input.role, req.requestId);
  }

  @Patch("tenants/:tenantId/members/:memberId")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Change a member role; ownership transfer demotes other owners (manager+)" })
  updateMember(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("memberId") memberId: string,
    @ZodBody(updateMemberRoleSchema) input: z.infer<typeof updateMemberRoleSchema>,
    @Req() req: Request,
  ) {
    return this.tenants.updateMemberRole(ctx.tenantId, user.id, memberId, input.role, req.requestId);
  }

  @Delete("tenants/:tenantId/members/:memberId")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("manager")
  @ApiOperation({ summary: "Remove a member (manager+)" })
  removeMember(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("memberId") memberId: string,
    @Req() req: Request,
  ) {
    return this.tenants.removeMember(ctx.tenantId, user.id, memberId, req.requestId);
  }
}
