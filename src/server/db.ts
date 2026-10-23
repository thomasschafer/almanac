import { DatabaseSync } from "node:sqlite";

/**
 * Schema migrations, applied in order. The database's user_version records how many have run.
 * Only ever append: an applied migration must never change.
 */
const migrations: readonly string[] = [
  `
  create table tool_state (
    tool text primary key,
    state text not null,
    updated_at text not null
  ) strict;

  create table presets (
    id text primary key,
    tool text not null,
    name text not null,
    state text not null,
    created_at text not null,
    updated_at text not null,
    unique (tool, name)
  ) strict;
  `,
];

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare("pragma user_version").get();
  const version = Number(row?.["user_version"]);
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`unexpected database user_version: ${String(row?.["user_version"])}`);
  }
  if (version > migrations.length) {
    throw new Error(
      `the database is at version ${String(version)}, newer than this app's ${String(migrations.length)}; deploy a newer version`,
    );
  }
  for (const [i, sql] of migrations.entries()) {
    if (i < version) continue;
    db.exec("begin");
    try {
      db.exec(sql);
      db.exec(`pragma user_version = ${String(i + 1)}`);
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  }
}
