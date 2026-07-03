import { Pool } from "pg";
import BetterSqlite3 from "better-sqlite3";
import path from "path";

export interface QueryResult {
  rows: Record<string, unknown>[];
}

interface DbAdapter {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  migrate(): Promise<void>;
}

// ─── SQL ────────────────────────────────────────────────────────────────────

const MIGRATE_PG = `
  CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    team_a_name TEXT NOT NULL,
    team_a_flag TEXT NOT NULL,
    team_b_name TEXT NOT NULL,
    team_b_flag TEXT NOT NULL,
    kickoff_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    real_score_a INT NULL,
    real_score_b INT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_scheduled_match ON matches (status) WHERE status = 'scheduled';
  CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY,
    match_id INT NOT NULL REFERENCES matches(id),
    username TEXT NOT NULL,
    score_a INT NOT NULL CHECK (score_a >= 0),
    score_b INT NOT NULL CHECK (score_b >= 0),
    points REAL NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (match_id, username)
  );
  CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS match_clients (
    id SERIAL PRIMARY KEY,
    match_id INT NOT NULL REFERENCES matches(id),
    ip TEXT NOT NULL,
    client TEXT NOT NULL,
    username TEXT NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_count INT NOT NULL DEFAULT 1,
    UNIQUE (match_id, ip, client)
  );
`;

const MIGRATE_SQLITE = `
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_a_name TEXT NOT NULL,
    team_a_flag TEXT NOT NULL,
    team_b_name TEXT NOT NULL,
    team_b_flag TEXT NOT NULL,
    kickoff_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    real_score_a INTEGER NULL,
    real_score_b INTEGER NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_scheduled_match ON matches (status) WHERE status = 'scheduled';
  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    username TEXT NOT NULL,
    score_a INTEGER NOT NULL CHECK (score_a >= 0),
    score_b INTEGER NOT NULL CHECK (score_b >= 0),
    points REAL NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (match_id, username)
  );
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS match_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    ip TEXT NOT NULL,
    client TEXT NOT NULL,
    username TEXT NOT NULL,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    request_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE (match_id, ip, client)
  );
`;

// Convert $1,$2… → ? and now() → datetime('now') for SQLite
function pgToSqlite(sql: string): string {
  return sql
    .replace(/\$\d+/g, "?")
    .replace(/\bnow\(\)/gi, "datetime('now')");
}

// ─── Adapters ────────────────────────────────────────────────────────────────

function createPgAdapter(url: string): DbAdapter {
  const pool = new Pool({ connectionString: url });
  return {
    async query(sql, params = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows };
    },
    async migrate() {
      await pool.query(MIGRATE_PG);
    },
  };
}

function createSqliteAdapter(): DbAdapter {
  const dbPath = process.env.SQLITE_PATH ?? path.join(process.cwd(), "bolao.db");
  const sqlite = BetterSqlite3(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return {
    async query(sql, params = []) {
      const converted = pgToSqlite(sql);
      const hasReturning = /\bRETURNING\b/i.test(converted);
      const isSelect = /^\s*(SELECT|WITH)\b/i.test(converted);

      if (isSelect || hasReturning) {
        const rows = sqlite.prepare(converted).all(...params) as Record<string, unknown>[];
        return { rows };
      } else {
        sqlite.prepare(converted).run(...params);
        return { rows: [] };
      }
    },
    async migrate() {
      sqlite.exec(MIGRATE_SQLITE);
    },
  };
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const isPostgres = /^postgres(ql)?:\/\//i.test(DATABASE_URL);

export const db: DbAdapter = isPostgres
  ? createPgAdapter(DATABASE_URL)
  : createSqliteAdapter();

export async function migrate(): Promise<void> {
  await db.migrate();
}

export async function seed(): Promise<void> {
  const { rows } = await db.query("SELECT COUNT(*) AS cnt FROM players");
  const cnt = Number(rows[0].cnt);
  if (cnt > 0) return;

  for (const username of ["Diego", "Cauã"]) {
    await db.query("INSERT INTO players (username) VALUES ($1)", [username]);
  }
}

// Apaga todas as partidas, palpites e o histórico de clientes, mantendo os jogadores cadastrados (voltam a 0 pontos).
// Também reinicia as chaves auto-increment, pra próxima partida voltar a ser id 1.
export async function resetAll(): Promise<void> {
  if (isPostgres) {
    await db.query("TRUNCATE match_clients, predictions, matches RESTART IDENTITY");
    return;
  }
  await db.query("DELETE FROM match_clients");
  await db.query("DELETE FROM predictions");
  await db.query("DELETE FROM matches");
  try {
    await db.query("DELETE FROM sqlite_sequence WHERE name IN ('match_clients','predictions','matches')");
  } catch {
    // sqlite_sequence só existe depois do primeiro insert com AUTOINCREMENT
  }
}
