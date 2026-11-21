import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { asc } from "drizzle-orm";
import { amenities } from "@turf/db";
import { Public } from "../common/guards/public.decorator.js";
import { DbService } from "../database/db-tokens.js";

@ApiTags("catalog")
@Controller("amenities")
export class AmenitiesController {
  constructor(private readonly db: DbService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Amenities catalog" })
  list() {
    return this.db.service.select().from(amenities).orderBy(asc(amenities.name));
  }
}
