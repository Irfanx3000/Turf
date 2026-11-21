import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedUser, PlatformRole } from "@turf/shared-types";
import { ROLES_KEY } from "../decorators/roles.decorator.js";

/** Enforces platform-level roles (customer | tenant_owner | super_admin). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user: AuthenticatedUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) return false;
    if (!required.includes(user.platformRole)) {
      throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "insufficient platform role" });
    }
    return true;
  }
}
