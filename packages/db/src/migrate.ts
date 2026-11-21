/**
 * Minimal, transparent SQL migration runner.
 *
 * - Applies `NNNN_*.sql` files from packages/db/migrations in order.
 * - Records applied files in `schema_migrations`.
 * - `down` rolls back the last applied migration using its `.down.sql`.
 * - Each file runs inside a transaction; a failure leaves the DB untouched.
 *
 * Migrations are hand-authored (not drizzle-kit generated) because they carry
 * PostGIS geography, exclusion constraints and RLS policies the Drizzle DSL
 * cannot express. The Drizzle schema in src/schema.ts mirrors them for typed
 * application queries.
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function connect(): Promise<pg.Client> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required (see .env.example). Start the stack with `docker compose up -d`.");
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString: url,
    // Migrations create extensions / roles: allow superuser-style ops locally.
    application_name: "turf-migrations",
  });
  await client.connect();
  return client;
}

async function ensureTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function listMigrations(): Promise<string[]> {
  const files = (await readdir(migrationsDir)).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql"));
  return files.sort();
}

async function up(): Promise<void> {
  const client = await connect();
  try {
    await ensureTable(client);
    const applied = new Set(
      (await client.query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename),
    );
    const files = await listMigrations();
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      console.log(`→ applying ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`${file} failed: ${(err as Error).message}`);
      }
    }
    console.log(ran === 0 ? "database already up to date" : `applied ${ran} migration(s)`);
  } finally {
    await client.end();
  }
}

async function down(steps = 1): Promise<void> {
  const client = await connect();
  try {
    await ensureTable(client);
    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT $1",
      [steps],
    );
    if (rows.length === 0) {
      console.log("nothing to roll back");
      return;
    }
    for (const row of rows) {
      const downFile = row.filename.replace(/\.sql$/, ".down.sql");
      const sql = await readFile(path.join(migrationsDir, downFile), "utf8");
      console.log(`← rolling back ${row.filename}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("DELETE FROM schema_migrations WHERE filename = $1", [row.filename]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`${downFile} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function status(): Promise<void> {
  const client = await connect();
  try {
    await ensureTable(client);
    const applied = new Set(
      (await client.query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename),
    );
    const files = await listMigrations();
    for (const f of files) {
      console.log(`${applied.has(f) ? "[x]" : "[ ]"} ${f}`);
    }
  } finally {
    await client.end();
  }
}

const command = process.argv[2] ?? "up";
switch (command) {
  case "up":
    await up();
    break;
  case "down":
    await down(Number(process.argv[3] ?? 1));
    break;
  case "status":
    await status();
    break;
  default:
    console.error(`unknown command "${command}" (use up | down [n] | status)`);
    process.exit(1);
}
