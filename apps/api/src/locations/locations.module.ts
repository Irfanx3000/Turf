import { Module } from "@nestjs/common";
import { MapsModule } from "../maps/maps.module.js";
import { LocationsController } from "./locations.controller.js";
import { LocationsService } from "./locations.service.js";

@Module({
  imports: [MapsModule],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
