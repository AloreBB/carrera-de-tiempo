# Carrera de Tiempo

PWA para carreras informales en **coche/moto**: eliges un destino, invitas con código/enlace y gana quien llegue primero. Mapa en vivo (MapLibre + OpenFreeMap), sin cuentas.

## Stack

- **Monorepo** Turborepo + pnpm
- `apps/web` — Next.js 15 PWA
- `apps/api` — NestJS + Prisma + Socket.IO
- `packages/shared` — tipos, haversine, tramos, códigos
- **Postgres** · mapas gratis (sin Google)

## Desarrollo

```bash
# DB en loopback
pnpm db:up

# dependencias
pnpm install
pnpm --filter @carrera/shared build
pnpm --filter @carrera/api exec prisma migrate deploy
pnpm --filter @carrera/api exec prisma generate

# terminales
pnpm --filter @carrera/api dev   # :3001
pnpm --filter @carrera/web dev   # :3000 (proxy /api y /socket.io → API)
```

Variables API: `apps/api/.env` (ver ejemplo).

## Tests

```bash
pnpm --filter @carrera/shared test
# API tests: needs `pnpm db:up` + secrets only in apps/api/.env (never commit .env)
pnpm --filter @carrera/api test

# E2E (API + web en marcha)
pnpm exec playwright install chromium
pnpm test:e2e
```

## Secrets

- **Never commit** `.env` / real passwords / JWT secrets.
- Use `.env.example` as a template only.
- Production secrets live in Dokploy (or your host env), not in git.

## Producción / dominio

**Un solo dominio web es suficiente.** El reverse proxy debe enviar:

| Ruta | Servicio |
|------|----------|
| `/` | Next.js |
| `/api/*` | NestJS |
| `/socket.io/*` | NestJS (WebSocket) |

No hace falta un subdominio `api.` (opcional solo si más adelante quieres escalar la API aparte).

Puertos Docker en host: solo `127.0.0.1` (ver `docker-compose*.yml`).
