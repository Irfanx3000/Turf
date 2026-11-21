import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import { tenantMembers, tenants } from "@turf/db";
import type { TenantRole } from "@turf/shared-types";
import { DbService } from "../../database/db-tokens.js";
import { TENANT_ROLES_KEY } from "../decorators/tenant-roles.decorator.js";
import type { AuthenticatedUser } from "@turf/shared-types";

const RANK: Record<TenantRole, number> = { staff: 1, manager: 2, owner: 3 };

export interface TenantContext {
  tenantId: string;
  role: TenantRole;
  userId: string;
}

declare module "express-serve-static-core" {
  interface Request {
    tenantContext?: TenantContext;
  }
}

/**
 * Server-side tenant isolation for every /tenants/:tenantId/... route:
 * verifies the JWT user is an active member of the tenant with a sufficient
 * role, and that the tenant itself is not suspended. The resolved context is
 * attached to the request; services must scope every query by tenantId.
 */
@Injectable()
export class TenantMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<TenantRole[] | undefined>(TENANT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const minRole: TenantRole = required ? required[0]! : "staff";

    const req = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = req.user;
    if (!user) throw new UnauthorizedException({ errorCode: "UNAUTHORIZED", message: "authentication required" });

    const tenantId: string | undefined = req.params?.tenantId;
    if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "valid tenantId route parameter required" });
    }

    const tenantRows = await this.db.service
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const tenant = tenantRows[0];
    if (!tenant) throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "tenant not found" });
    if (tenant.status === "suspended") {
      throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "tenant is suspended" });
    }

    const memberRows = await this.db.service
      .select({ role: tenantMembers.role })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, user.id)))
      .limit(1);
    const member = memberRows[0];
    if (!member) throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "not a member of this tenant" });
    if (RANK[member.role] < RANK[minRole]) {
      throw new ForbiddenException({ errorCode: "FORBIDDEN", message: `requires ${minRole} role or above` });
    }

    req.tenantContext = { tenantId, role: member.role, userId: user.id };
    return true;
  }
}
