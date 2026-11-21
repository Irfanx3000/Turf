import { Module } from "@nestjs/common";
import { AmenitiesController } from "./amenities.controller.js";

@Module({ controllers: [AmenitiesController] })
export class AmenitiesModule {}
