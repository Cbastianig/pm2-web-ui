import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  username: text("username").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const monitoring = sqliteTable("monitoring", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pm2Name: text("pm2_name").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const logEntries = sqliteTable("log_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monitorId: integer("monitor_id")
    .notNull()
    .references(() => monitoring.id, { onDelete: "cascade" }),
  loggedAt: integer("logged_at").notNull(),
  logLevel: text("log_level").default(""),
  log: text("log").notNull(),
  raw: text("raw").notNull(),
});

export const logLevel = sqliteTable("log_level", {
  logLevel: text("log_level"),
  createdAt: integer("created_at"),
});

export const processMetrics = sqliteTable("process_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monitorId: integer("monitor_id")
    .notNull()
    .references(() => monitoring.id, { onDelete: "cascade" }),
  sampledAt: integer("sampled_at").notNull(),
  cpu: real("cpu").default(0),
  memory: real("memory").default(0),
  restarts: integer("restarts").default(0),
  uptime: integer("uptime"),
  status: text("status").default(""),
  pid: integer("pid"),
});

export const alertSettings = sqliteTable("alert_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const alertPrefs = sqliteTable("alert_prefs", {
  pm2Name: text("pm2_name").primaryKey(),
  alertsEnabled: integer("alerts_enabled").notNull().default(1),
});

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  pm2Name: text("pm2_name").notNull().unique(),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch").notNull().default("main"),
  deployPath: text("deploy_path").notNull(),
  startScript: text("start_script").notNull(),
  installCmd: text("install_cmd").default(""),
  buildCmd: text("build_cmd").default(""),
  preSetupScript: text("pre_setup_script").default(""),
  postSetupScript: text("post_setup_script").default(""),
  envVars: text("env_vars").default("{}"),
  pm2Options: text("pm2_options").default("{}"),
  deploying: integer("deploying").default(0),
  createdAt: integer("created_at").notNull(),
  lastDeployedAt: integer("last_deployed_at"),
});

export const hostMetrics = sqliteTable("host_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sampledAt: integer("sampled_at").notNull(),
  cpuPercent: real("cpu_percent").default(0),
  ramUsed: real("ram_used").default(0),
  ramTotal: real("ram_total").default(0),
  diskUsed: real("disk_used").default(0),
  diskTotal: real("disk_total").default(0),
});

export const releaseHistory = sqliteTable("release_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  appName: text("app_name").notNull(),
  commit: text('"commit"').notNull(),
  branch: text("branch").notNull(),
  pipelineId: integer("pipeline_id"),
  pipelineStatus: text("pipeline_status"),
  pipelineDuration: integer("pipeline_duration"),
  author: text("author").notNull().default(""),
  date: text("date").notNull(),
  environment: text("environment").notNull(),
  deployedAt: integer("deployed_at").notNull(),
  message: text("message").default(""),
});
