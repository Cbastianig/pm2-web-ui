# PM2 Process Web UI

Modern real-time dashboard for PM2 process monitoring, log streaming, and management. Rebuilt with TanStack Start, TypeScript, and shadcn/ui.

## Features

- Real-time process monitoring via Server-Sent Events (SSE)
- Live log streaming with filtering, search, pause, and download
- Process management: restart, stop, delete, flush logs
- Monitoring with persistent log storage and metrics history
- Multi-process actions (select, bulk restart/stop)
- Authentication with scrypt + timing-safe comparison
- Rate limiting and brute-force protection
- Secure session cookies (HttpOnly, Secure, SameSite=Lax)
- Security headers (CSP, HSTS, X-Frame-Options)
- Dark theme by default
- Responsive design
- Full TypeScript
- Drizzle ORM + SQLite

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy and edit environment
cp .env.example .env

# Generate password hash
node -e "const crypto = require('crypto'); const salt = crypto.randomBytes(16).toString('hex'); const hash = crypto.scryptSync('YOUR_PASSWORD', Buffer.from(salt,'hex'), 64).toString('hex'); console.log('AUTH_PASSWORD_SALT=' + salt); console.log('AUTH_PASSWORD_HASH=' + hash);"

# Development
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| HOST | 0.0.0.0 | Bind address |
| PORT | 3005 | Server port |
| BASE_PATH | / | Base path for subpath deployments |
| AUTH_USERNAME | admin | Login username |
| AUTH_PASSWORD_SALT | required | Hex-encoded scrypt salt |
| AUTH_PASSWORD_HASH | required | Hex-encoded scrypt hash (64 bytes) |
| SESSION_TTL_MS | 28800000 | Session lifetime (8h) |
| JWT_SECRET | required | JWT signing secret (min 32 chars) |
| TRUST_PROXY | 0 | Set to `1` only when behind a trusted reverse proxy |
| SQLITE_DB_PATH | ./data/pm2-process-web-ui.db | SQLite database path |

See `.env.example` for all options.

## Reverse proxy & rate limiting

`TRUST_PROXY` controls whether the app trusts `x-forwarded-for` / `x-forwarded-proto` headers:

- **`TRUST_PROXY=0` (default)**: forged headers are ignored. The login rate limit and account lockout use the real client IP from the TCP socket, so an attacker cannot bypass brute-force protection by spoofing `x-forwarded-for`.
- **`TRUST_PROXY=1`**: header values are trusted. Only enable this when the app is reachable exclusively through a trusted reverse proxy (Apache, nginx) that overwrites those headers — otherwise spoofing them bypasses rate limiting and affects `Secure` cookie handling.

## Running under PM2

```bash
# Production build
pnpm build

# Start with PM2 (uses ecosystem.config.cjs)
pm2 start ecosystem.config.cjs

# Persist across reboots
pm2 save
pm2 startup

# Useful commands
pm2 status            # List apps
pm2 logs pm2-process-web-ui
pm2 restart pm2-process-web-ui
pm2 stop pm2-process-web-ui
```

The app runs via `start.pm2.mjs`, which loads `.env` with `process.loadEnvFile` before launching srvx. This is required because srvx skips loading `.env` when spawned as a PM2 child (IPC) process.

## Deployment behind Apache

```apache
ProxyPass        /pm2-web http://127.0.0.1:3005
ProxyPassReverse /pm2-web http://127.0.0.1:3005
ProxyIOBufferSize 0
SetEnv proxy-nokeepalive 1
```

Set `BASE_PATH=/pm2-web` in `.env`. The `ProxyIOBufferSize 0` directive is required to disable response buffering for SSE to work correctly.

## Tech Stack

- TanStack Start (React 19)
- TanStack Router
- TanStack Query
- TanStack Table
- Vite 6
- TypeScript
- TailwindCSS 4
- shadcn/ui
- Drizzle ORM + better-sqlite3
- Zustand
- Zod

## Architecture

```
src/
  routes/          File-based routing (TanStack Router)
  server/
    auth/          Authentication (scrypt, sessions, rate limiting)
    pm2/           PM2 API encapsulation
    events/        SSE event bus and log bus
    actions/       Server functions (RPC)
    storage/       Drizzle ORM schema and DB client
  components/      React components
    ui/            shadcn/ui components
  hooks/           Custom React hooks (useEventSource)
  lib/             Utilities (env, cn)
  stores/          Zustand stores
  types/           TypeScript declarations
  styles/          Global CSS
```

## License

Apache-2.0
