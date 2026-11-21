import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { sql } from "drizzle-orm";
import { Public } from "../common/guards/public.decorator.js";
import { DbService } from "../database/db-tokens.js";
import { ENV, razorpayActive } from "../config/configuration.js";

import { authVerifier } from "../auth/verifier-provider.js";
import { DevJwtVerifier } from "../auth/jwt-verifier.js";
import { mapsProviderName } from "../maps/maps-provider.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liveness + dependency readiness" })
  async health() {
    let db: "up" | "down" = "up";
    try {
      await this.db.service.execute(sql`SELECT 1`);
    } catch {
      db = "down";
    }

    const verifier = authVerifier();
    const authMode = verifier instanceof DevJwtVerifier ? "dev-adapter" : "supabase";

    return {
      status: db === "up" ? "ok" : "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database: db,
        auth: authMode,
        payments: razorpayActive() ? "razorpay" : "mock-adapter",
        maps: `${mapsProviderName()}${ENV.MAPS_PROVIDER !== "mock" ? "" : "-adapter"}`,
        environment: ENV.NODE_ENV,
      },
      // Adapters are reported explicitly — the platform never fakes a provider.
      notes:
        authMode === "dev-adapter"
          ? "running with development adapters; set Supabase/Razorpay credentials for production behavior"
          : undefined,
      timestamp: new Date().toISOString(),
    };
  }
}
