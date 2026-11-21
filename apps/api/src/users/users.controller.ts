import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import { profiles } from "@turf/db";
import { updateProfileSchema } from "@turf/validation";
import type { AuthenticatedUser } from "@turf/shared-types";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { DbService } from "../database/db-tokens.js";
import { audit } from "../audit-logs/audit.helper.js";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly db: DbService) {}

  @Get("me")
  @ApiOperation({ summary: "Fetch own profile" })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.db.service.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
    const p = rows[0]!;
    return {
      id: p.id,
      email: p.email,
      platformRole: p.platformRole,
      fullName: p.fullName,
      phone: p.phone,
      avatarUrl: p.avatarUrl,
      createdAt: p.createdAt,
    };
  }

  @Patch("me")
  @ApiOperation({ summary: "Update own profile" })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(updateProfileSchema) input: ReturnType<typeof updateProfileSchema.parse>,
  ) {
    await this.db.service
      .update(profiles)
      .set({
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      })
      .where(eq(profiles.id, user.id));
    return this.me(user);
  }
}
