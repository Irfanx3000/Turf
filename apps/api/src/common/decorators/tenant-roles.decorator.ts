import { createParamDecorator, SetMetadata } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { TenantRole } from "@turf/shared-types";
import type { TenantContext } from "../guards/tenant-member.guard.js";

export const TENANT_ROLES_KEY = "tenant:roles";
/** Minimum tenant role required by the route (staff < manager < owner). */
export const TenantRoles = (role: TenantRole) => SetMetadata(TENANT_ROLES_KEY, [role]);

/** Reads the tenant context resolved by TenantMemberGuard. */
export const TenantCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => ctx.switchToHttp().getRequest().tenantContext,
);
