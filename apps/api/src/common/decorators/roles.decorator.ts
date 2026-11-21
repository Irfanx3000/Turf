import { SetMetadata } from "@nestjs/common";
import type { PlatformRole } from "@turf/shared-types";

export const ROLES_KEY = "platform:roles";
export const Roles = (...roles: PlatformRole[]) => SetMetadata(ROLES_KEY, roles);
