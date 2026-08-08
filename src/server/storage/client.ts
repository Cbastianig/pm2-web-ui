import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { readEnv } from "@/lib/env";
import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;

  const dbPath = readEnv("SQLITE_DB_PATH");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  _db = drizzle(sqlite, { schema });
  return _db;
}

export function initDb() {
  const db = getDb();
  const sqlite = db.run.bind(db);

  // Create tables if they don't exist (first-time setup)
  sqlite(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  sqlite(`
    CREATE TABLE IF NOT EXISTS monitoring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pm2_name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  sqlite(`
    CREATE TABLE IF NOT EXISTS log_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitoring(id) ON DELETE CASCADE,
      logged_at INTEGER NOT NULL,
      log_level TEXT DEFAULT '',
      log TEXT NOT NULL,
      raw TEXT NOT NULL
    )
  `);

  sqlite(`
    CREATE TABLE IF NOT EXISTS process_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitoring(id) ON DELETE CASCADE,
      sampled_at INTEGER NOT NULL,
      cpu REAL DEFAULT 0,
      memory REAL DEFAULT 0,
      restarts INTEGER DEFAULT 0,
      uptime INTEGER,
      status TEXT DEFAULT '',
      pid INTEGER
    )
  `);

  sqlite(`
    CREATE TABLE IF NOT EXISTS alert_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  sqlite(`
    CREATE TABLE IF NOT EXISTS alert_prefs (
      pm2_name TEXT PRIMARY KEY,
      alerts_enabled INTEGER NOT NULL DEFAULT 1
    )
  `);

  sqlite(`
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      pm2_name TEXT NOT NULL UNIQUE,
      repo_url TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      deploy_path TEXT NOT NULL,
      start_script TEXT NOT NULL,
      install_cmd TEXT DEFAULT '',
      build_cmd TEXT DEFAULT '',
      pre_setup_script TEXT DEFAULT '',
      post_setup_script TEXT DEFAULT '',
      env_vars TEXT DEFAULT '{}',
      pm2_options TEXT DEFAULT '{}',
      deploying INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_deployed_at INTEGER
    )
  `);

  sqlite(`
    CREATE TABLE IF NOT EXISTS host_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sampled_at INTEGER NOT NULL,
      cpu_percent REAL DEFAULT 0,
      ram_used REAL DEFAULT 0,
      ram_total REAL DEFAULT 0,
      disk_used REAL DEFAULT 0,
      disk_total REAL DEFAULT 0
    )
  `);

  sqlite(`
    CREATE TABLE IF NOT EXISTS release_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      "commit" TEXT NOT NULL,
      branch TEXT NOT NULL,
      pipeline_id INTEGER,
      pipeline_status TEXT,
      pipeline_duration INTEGER,
      author TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      environment TEXT NOT NULL,
      deployed_at INTEGER NOT NULL,
      message TEXT DEFAULT ''
    )
  `);

  return db;
}
