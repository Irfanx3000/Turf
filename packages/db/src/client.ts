/**
 * Database access layer for the API.
 *
 * Two pools, two trust levels (see docs/ARCHITECTURE.md):
 *
 *  userPool (turf_app, RLS-enforced)
 *    Request-scoped reads where Row Level Security itself is the enforcement
 *    layer. Before querying, the caller MUST set the JWT subject for the
 *    transaction via `withUserContext`.
 *
 *  servicePool (turf_service, BYPASSRLS)
 *    The transactional booking/payment engine, webhook processing, sweeps
 *    and background jobs. The application layer authenticates and
 *    authorizes BEFORE touching this pool; it never trusts client-supplied
 *    ids, prices or states.
 */
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { parseEnv } from "@turf/config";

export type Db = NodePgDatabase<typeof schema>;

function createPool(connectionString: string, max: number, appName: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: appName,
  });
}

export interface DbPools {
  userPool: pg.Pool;
  servicePool: pg.Pool;
  /** Drizzle instance bound to the service pool (booking engine, jobs). */
  serviceDb: Db;
  /** Drizzle instance bound to the user pool (RLS-scoped reads). */
  userDb: Db;
  end(): Promise<void>;
}

export function createDbPools(env = parseEnv(process.env)): DbPools {
  // Prefer DIRECT_URL (Supabase session pooler caveats aside, direct is
  // required for DDL and transactions with advisory locks).
  const conn = env.DIRECT_URL ?? env.DATABASE_URL;
  const userPool = createPool(conn, 10, "turf-api-user");
  const servicePool = createPool(conn, 5, "turf-api-service");
  return {
    userPool,
    servicePool,
    userDb: drizzle(userPool, { schema }),
    serviceDb: drizzle(servicePool, { schema }),
    async end() {
      await Promise.all([userPool.end(), servicePool.end()]);
    },
  };
}

/**
 * Run a callback with the Supabase-compatible JWT claims set for the
 * transaction, so RLS policies using auth.uid() apply on the user pool.
 */
export async function withUserContext<T>(
  userPool: pg.Pool,
  userId: string,
  role: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await userPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("SELECT set_config('request.jwt.claim.role', $1, true)", [role]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
