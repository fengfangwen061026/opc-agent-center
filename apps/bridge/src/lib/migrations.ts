import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

export function runMigrations(
  dbPath = "data/opc-agent-center.sqlite",
  migrationsDir = "data/migrations",
): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(migrationsDir, { recursive: true });
  const db = new Database(dbPath);
  db.exec(
    "create table if not exists schema_version (version text primary key, applied_at text not null)",
  );
  const applied = new Set(
    db
      .prepare("select version from schema_version")
      .all()
      .map((row) => String((row as { version: string }).version)),
  );
  const migrations = readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  for (const migration of migrations) {
    if (applied.has(migration)) continue;
    const sql = readFileSync(join(migrationsDir, migration), "utf8");
    const transaction = db.transaction(() => {
      db.exec(sql);
      db.prepare("insert into schema_version (version, applied_at) values (?, ?)").run(
        migration,
        new Date().toISOString(),
      );
    });
    transaction();
  }
  db.close();
}
