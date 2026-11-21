import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { DatabaseModule } from "./database/database.module.js";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware.js";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard.js";
import { RolesGuard } from "./common/guards/roles.guard.js";
import { ENV } from "./config/configuration.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { UsersModule } from "./users/users.module.js";
import { MapsModule } from "./maps/maps.module.js";
import { TenantsModule } from "./tenants/tenants.module.js";
import { LocationsModule } from "./locations/locations.module.js";
import { SportsModule } from "./sports/sports.module.js";
import { AmenitiesModule } from "./amenities/amenities.module.js";
import { TurfsModule } from "./turfs/turfs.module.js";
import { SlotsModule } from "./slots/slots.module.js";
import { PricingModule } from "./pricing/pricing.module.js";
import { BookingsModule } from "./bookings/bookings.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { PushModule } from "./push/push.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { ReviewsModule } from "./reviews/reviews.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { AuditLogsModule } from "./audit-logs/audit-logs.module.js";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: ENV.RATE_LIMIT_TTL_SECONDS * 1000,
        limit: ENV.RATE_LIMIT_MAX,
        skipIf: () => ENV.NODE_ENV === "test",
      },
    ]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    MapsModule,
    TenantsModule,
    LocationsModule,
    SportsModule,
    AmenitiesModule,
    TurfsModule,
    SlotsModule,
    PricingModule,
    BookingsModule,
    PaymentsModule,
    NotificationsModule,
    PushModule,
    JobsModule,
    AnalyticsModule,
    ReviewsModule,
    AdminModule,
    AuditLogsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
