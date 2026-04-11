import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'spendwise.sqlite');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all 5 tables on boot. statements first — transactions FK references it.
db.exec(`
  CREATE TABLE IF NOT EXISTS statements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT    NOT NULL,
    hash        TEXT    NOT NULL UNIQUE,
    autopsy_json TEXT,
    uploaded_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT    NOT NULL CHECK(type IN ('income','expense','savings')),
    category     TEXT    NOT NULL,
    amount       REAL    NOT NULL CHECK(amount > 0),
    date         TEXT    NOT NULL,
    description  TEXT,
    source       TEXT    NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','statement')),
    statement_id INTEGER REFERENCES statements(id) NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS goals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    target_amount REAL    NOT NULL,
    deadline      TEXT    NOT NULL,
    priority      TEXT    NOT NULL CHECK(priority IN ('high','medium','low')),
    status        TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS allocations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    amount     REAL    NOT NULL,
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insights_cache (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    month        TEXT    NOT NULL UNIQUE,
    content_json TEXT    NOT NULL,
    generated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
