import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module.js";
import { JobsService } from "./jobs.service.js";

@Module({
  imports: [PaymentsModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
