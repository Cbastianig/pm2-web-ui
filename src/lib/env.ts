import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().default(3005),
  BASE_PATH: z.string().default("/"),
  AUTH_USERNAME: z.string().min(1).default("admin"),
  AUTH_PASSWORD_SALT: z.string().min(1),
  AUTH_PASSWORD_HASH: z.string().min(1),
  SESSION_TTL_MS: z.coerce.number().int().positive().default(28800000),
  JWT_SECRET: z.string().min(32),
  AUTH_MIN_RESPONSE_MS: z.coerce.number().int().default(900),
  LOGIN_WINDOW_MS: z.coerce.number().int().default(600000),
  LOGIN_MAX_REQUESTS: z.coerce.number().int().default(12),
  LOGIN_FAILURE_WINDOW_MS: z.coerce.number().int().default(1800000),
  LOGIN_MAX_LOCKOUT_MS: z.coerce.number().int().default(43200000),
  UNAUTH_WINDOW_MS: z.coerce.number().int().default(60000),
  UNAUTH_MAX_REQUESTS: z.coerce.number().int().default(10),
  UNAUTH_PENALTY_MS: z.coerce.number().int().default(5000),
  COOKIE_SECURE: z.enum(["auto", "always", "never"]).default("auto"),
  TRUST_PROXY: z
    .string()
    .transform((v) => v === "1")
    .default("0"),
  MAX_LOG_BYTES_PER_FILE: z.coerce
    .number()
    .int()
    .default(5 * 1024 * 1024),
  METRICS_RETENTION_MS: z.coerce.number().int().default(24 * 60 * 60 * 1000),
  LOGS_RETENTION_MS: z.coerce
    .number()
    .int()
    .default(14 * 24 * 60 * 60 * 1000),
  SQLITE_DB_PATH: z.string().default("./data/pm2-process-web-ui.db"),
  DEPLOY_BASE_DIR: z.string().default("./apps"),
  OPS_APPS_PATH: z.string().default("/mnt/sdc1/www"),
  GITLAB_URL: z.string().default("https://gitlab.com"),
  GITLAB_TOKEN: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const raw = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v ?? ""])
  );
  _env = envSchema.parse(raw);
  return _env;
}

export function readEnv<K extends keyof Env>(key: K): Env[K] {
  return getEnv()[key];
}

// For tests only — clears the cached env singleton
export function _resetEnv() {
  _env = null;
}
