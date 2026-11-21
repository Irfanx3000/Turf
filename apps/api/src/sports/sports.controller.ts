import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { asc, eq } from "drizzle-orm";
import { sports } from "@turf/db";
import { Public } from "../common/guards/public.decorator.js";
import { DbService } from "../database/db-tokens.js";

@ApiTags("catalog")
@Controller("sports")
export class SportsController {
  constructor(private readonly db: DbService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Active sports catalog" })
  async list() {
    return this.db.service.select().from(sports).where(eq(sports.isActive, true)).orderBy(asc(sports.name));
  }
}
