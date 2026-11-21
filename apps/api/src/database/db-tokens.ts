import { Inject, Injectable } from "@nestjs/common";
import type { Db, DbPools } from "@turf/db";

/** Injection token for the raw pg pools (advanced use). */
export const DB_POOLS = Symbol("DB_POOLS");

/** Typed accessor for the Drizzle instances bound to both pg pools. */
@Injectable()
export class DbService {
  constructor(@Inject(DB_POOLS) private readonly pools: DbPools) {}

  get service(): Db {
    return this.pools.serviceDb;
  }

  get user(): Db {
    return this.pools.userDb;
  }

  get poolsRef(): DbPools {
    return this.pools;
  }
}
