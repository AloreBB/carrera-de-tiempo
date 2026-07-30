# Carrera de Tiempo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable PWA monorepo where users create car/moto destination races, invite via code/link, race live over Socket.IO with MapLibre, and view rankings + segments — with unit, API, WS, and Playwright tests, ready for Dokploy.

**Architecture:** Turborepo monorepo: `apps/web` (Next.js PWA) + `apps/api` (NestJS + Prisma + Socket.IO) + `packages/shared` (types/events/pure geo helpers). Postgres for persistence. Single public origin in production: reverse proxy routes `/` → web, `/api` + `/socket.io` → Nest (no separate API domain required).

**Tech Stack:** pnpm, Turborepo, Next.js 15 App Router, NestJS 11, Prisma 6, PostgreSQL 16, Socket.IO 4, MapLibre GL, Photon geocode proxy, Playwright, Vitest/Jest, Docker Compose (loopback ports only).

## Global Constraints

- Product name: **Carrera de Tiempo**; repo root: `projects/carrera-de-tiempo`
- Spec: `docs/superpowers/specs/2026-07-30-carrera-de-tiempo-design.md` — follow it
- No Google Maps; MapLibre + OpenFreeMap + Photon proxy
- No user accounts; nickname + `clientId` UUID + `wsToken` (JWT)
- Join modes: `OPEN` | `APPROVAL`; optional 4-digit PIN (hashed)
- Race states: `LOBBY` → `COUNTDOWN` → `RACING` → `FINISHED` (or `CANCELLED`)
- Finish radius default **80 m**; segments: **4** by path distance; GPS throttle **2 s / 15 m**; position batch **~1 s**
- Mid-race join **disallowed**; max **20** participants; code alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` length **6**
- Docker: **never** bind `0.0.0.0`; only `127.0.0.1` host ports
- Production: prefer **one web domain**; API under same host via path proxy
- Spanish UI copy; mobile-first; simple UI
- Tests required: unit (geo/segments/codes), API integration, WS integration, Playwright E2E
- Commits: small, conventional (`feat:`, `test:`, `chore:`)

## File map (target)

```text
carrera-de-tiempo/
├── apps/api/                 # NestJS
│   ├── prisma/schema.prisma
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── races/            # REST + service
│   │   ├── race-gateway/     # Socket.IO
│   │   ├── geo/              # Photon proxy
│   │   ├── auth/             # wsToken JWT
│   │   └── prisma/
│   └── test/
├── apps/web/                 # Next.js PWA
│   ├── app/                  # pages: home, create, r/[code], race live, results
│   ├── components/
│   ├── lib/                  # api client, socket, geo, storage
│   └── public/manifest...
├── packages/shared/          # enums, events, haversine, segments, codes
├── e2e/                      # Playwright
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile                # multi-stage or dual services
└── package.json              # workspace root
```

---

### Task 1: Monorepo scaffold + shared pure utils + unit tests

**Files:**
- Create: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.npmrc`
- Create: `packages/shared/**` (types, haversine, segments, race-code, events)
- Create: `packages/shared` vitest tests
- Create: `docker-compose.yml` (Postgres `127.0.0.1:5434:5432`)
- Create: `apps/api` and `apps/web` minimal package shells (enough for turbo)

**Interfaces:**
- Produces: `haversineMeters(a,b)`, `isWithinRadius(a,b,radiusM)`, `splitTrackIntoSegments(samples, n=4)`, `generateRaceCode()`, event name constants, shared enums/types
- Consumes: nothing

- [ ] **Step 1:** Scaffold workspace and `packages/shared` with pure functions + Vitest
- [ ] **Step 2:** Run shared unit tests — all pass
- [ ] **Step 3:** Add docker-compose Postgres on `127.0.0.1:5434`
- [ ] **Step 4:** Commit `chore: scaffold monorepo and shared geo utils`

**Verify:** `pnpm --filter @carrera/shared test` passes; `docker compose up -d db` healthy.

---

### Task 2: NestJS API — Prisma schema + races REST + geo proxy

**Files:**
- Create: `apps/api` Nest app, Prisma schema per design spec
- Create: races module (create, get by code, join, approve, start, finish, results)
- Create: geo module (Photon proxy + in-memory cache)
- Create: JWT wsToken issue on create/join
- Create: integration tests with test database

**Interfaces:**
- Consumes: shared code generator, types
- Produces: REST as in design §7; `wsToken` JWT claims `{ raceId, participantId, clientId, isHost }`

- [ ] **Step 1:** Prisma models + migrate
- [ ] **Step 2:** Implement races service + controller
- [ ] **Step 3:** Geo search proxy
- [ ] **Step 4:** API tests (create/join/pin/approve/start flow)
- [ ] **Step 5:** Commit `feat(api): races REST and prisma models`

**Verify:** API tests green against Postgres.

---

### Task 3: Socket.IO gateway — live race

**Files:**
- Create: `apps/api/src/race-gateway/*`
- Create: WS integration tests

**Interfaces:**
- Consumes: wsToken, races service, haversine
- Produces: events from design §8 (`race:state`, `race:positions`, `race:countdown`, `race:started`, `race:finished_one`, `race:completed`, host actions)

- [ ] **Step 1:** Gateway auth middleware + rooms
- [ ] **Step 2:** Position rate limit + batch emit + finish detection + results payload
- [ ] **Step 3:** WS tests
- [ ] **Step 4:** Commit `feat(api): socket.io race gateway`

**Verify:** WS tests pass (join → start → position near dest → finish).

---

### Task 4: Next.js PWA — UI flows + MapLibre

**Files:**
- Create: `apps/web` pages and components per design §5
- Create: API/socket clients; localStorage clientId + recents
- Create: PWA manifest + basic service worker / serwist or next-pwa equivalent
- Next rewrites: `/api/*` and `/socket.io/*` → Nest in dev

**Interfaces:**
- Consumes: REST + Socket.IO + shared types
- Produces: Home, Create, Join `/r/[code]`, Lobby, Live map, Results

- [ ] **Step 1:** App shell + home/create/join/lobby
- [ ] **Step 2:** Live race map (MapLibre + OpenFreeMap) + geolocation
- [ ] **Step 3:** Results + recents + PWA manifest
- [ ] **Step 4:** Commit `feat(web): PWA race UI and live map`

**Verify:** Manual smoke with API running; TypeScript build passes.

---

### Task 5: Playwright E2E + polish

**Files:**
- Create: `e2e/*.spec.ts` — create race, join second context, start, mock geolocation to finish, assert results
- Fix any bugs found
- README with dev/run instructions

- [ ] **Step 1:** Playwright config + fixtures (two browsers, mock geo)
- [ ] **Step 2:** Full flow E2E green
- [ ] **Step 3:** Commit `test(e2e): full race flow with playwright`

**Verify:** `pnpm test:e2e` passes.

---

### Task 6: Production Docker + Dokploy deploy config

**Files:**
- Create: `Dockerfile`(s), `docker-compose.prod.yml`, env examples
- Single-origin proxy strategy documented
- Health endpoints

- [ ] **Step 1:** Multi-service images (api, web) or combined stack
- [ ] **Step 2:** Health checks; prisma migrate on boot
- [ ] **Step 3:** Dokploy project/app via MCP; deploy; verify health
- [ ] **Step 4:** Commit `chore: production docker and deploy config`

**Verify:** Deployed stack responds; document domain needs for user.

---

## Domain decision (for deploy)

**Recommendation: only one public domain (web).**  
Reverse proxy (Caddy/Traefik/Dokploy):

- `https://TU_DOMINIO/` → Next.js  
- `https://TU_DOMINIO/api/*` → Nest  
- `https://TU_DOMINIO/socket.io/*` → Nest (WebSocket upgrade)

**Separate `api.` subdomain is optional**, not required. Same-origin avoids CORS, simplifies PWA, cookies, and Socket.IO. Use a second domain only if you later split scaling/CDN.

---

## Self-review checklist

- [x] Spec features mapped to tasks 1–6  
- [x] No Google maps  
- [x] WS + REST + segments + history  
- [x] Playwright required  
- [x] Docker loopback policy  
- [x] Single-domain deploy path
