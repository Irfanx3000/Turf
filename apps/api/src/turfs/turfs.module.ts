import { Module } from "@nestjs/common";
import { TurfsController } from "./turfs.controller.js";
import { TurfsService } from "./turfs.service.js";

@Module({
  controllers: [TurfsController],
  providers: [TurfsService],
  exports: [TurfsService],
})
export class TurfsModule {}
