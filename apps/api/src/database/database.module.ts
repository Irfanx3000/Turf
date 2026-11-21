import { Global, Module } from "@nestjs/common";
import { createDbPools, type DbPools } from "@turf/db";
import { DB_POOLS, DbService } from "./db-tokens.js";

/**
 * Owns the two pg pools (RLS-enforced user pool, service pool for the
 * transactional engine). See packages/db/src/client.ts and docs/ARCHITECTURE.md
 * for the trust model.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB_POOLS,
      useFactory: (): DbPools => createDbPools(),
    },
    DbService,
  ],
  exports: [DbService, DB_POOLS],
})
export class DatabaseModule {}
