# Carrera de Tiempo — Design Spec

**Date:** 2026-07-30  
**Status:** Draft for user review  
**Product name:** Carrera de Tiempo  
**Repo path:** `projects/carrera-de-tiempo`

---

## 1. Problem and goals

Build an installable **PWA** for **car/motorcycle** informal races: the host picks a **destination** (Waze-style), each racer starts from **their own GPS location**, invites friends with a **code/link** (optional PIN or host approval), and everyone sees **live positions** on a map until someone reaches the destination. After the race, show **ranking, times, and segment stats** (slowest/fastest stretches). Keep the UI extremely simple. No user accounts in the MVP.

### Success criteria (MVP)

- Create a race room with destination search + map pin in under a minute.
- Join via link or 6-character code with only a nickname.
- Host starts a shared countdown; race clock is server-authoritative.
- Live map shows self, rivals, and destination (no turn-by-turn navigation).
- First to enter finish radius wins; full ranking and 4 distance-based segments per participant.
- Race results persist on the server and are shareable by code/link; “recents” live on the device.

### Non-goals (MVP)

- User accounts, social login, or cross-device profile.
- Turn-by-turn navigation or voice guidance.
- Forced shared start point / meet-up first.
- Google Maps / Google billing APIs.
- Horizontal multi-instance WebSocket cluster (documented for later only).

---

## 2. Product decisions (locked)

| Topic | Decision |
|-------|----------|
| Mode | Car / motorcycle |
| Route model | Destination only; start = each participant’s current GPS |
| Competition | Same destination; free starts; first arrival wins |
| Identity | No accounts; nickname + device `clientId` (UUID in `localStorage`) |
| Join modes | `OPEN` (code/link + optional PIN) **or** `APPROVAL` (host accepts) |
| History | Per-race on server; recents list on device |
| Map UX | Destination + rivals live; no turn-by-turn |
| Start | Host triggers countdown (3-2-1) |
| Finish radius | Default **80 m** (configurable per race later if needed) |
| Segments | **4** equal distance bands along each participant’s recorded track |
| GPS uplink | At most every **2 s** or after **>15 m** movement |
| Position broadcast | Server batches to room about every **1 s** |

---

## 3. Architecture overview

```text
[PWA Next.js]  --HTTPS/REST-->  [NestJS API]
       |                              |
       +--Socket.IO (wsToken)---------+
       |                              +--Prisma--> [PostgreSQL]
       |                              +--proxy--> Photon (geocode, cached)
       +--MapLibre tiles------------> OpenFreeMap (public, no API key)
```

### Monorepo (Turborepo + pnpm)

```text
carrera-de-tiempo/
├── apps/
│   ├── web/                 # Next.js App Router PWA
│   └── api/                 # NestJS + Prisma + Socket.IO gateway
├── packages/
│   ├── shared/              # Event names, DTOs, enums, pure helpers (haversine types)
│   ├── eslint-config/
│   └── tsconfig/
├── docker-compose.yml       # Postgres (and later api/web) — loopback only
├── turbo.json
├── pnpm-workspace.yaml
└── docs/superpowers/specs/
```

### Why this stack

- **Next.js PWA:** installable app, mobile-first UI, one web codebase.
- **NestJS:** clear modules, REST + WebSocket gateway, fits Prisma.
- **PostgreSQL + Prisma:** concurrent race updates, JSON results, production path.
- **Socket.IO:** rooms, reconnect, acks, optional Redis adapter later.
- **MapLibre + OpenFreeMap:** free vector tiles, no Google cost.
- **Photon (proxied):** free-form geocoding with server-side rate limit and cache.

---

## 4. Free maps stack (no Google)

| Concern | Choice | Notes |
|---------|--------|--------|
| Map tiles | **OpenFreeMap** public instance | No API key; attribution required (MapLibre handles OSM/OpenMapTiles attribution) |
| Map client | **MapLibre GL JS** | Vector styles from OpenFreeMap |
| Geocoding | **Photon** via Nest `GET /geo/search?q=` | Debounce in UI; cache + rate limit in API; do not call public Photon from every browser unchecked |
| Routing | **Out of MVP** | Optional later: self-hosted OSRM if a suggested path line is desired |

---

## 5. Screens and user flows

### Screens

1. **Home** — Create race · Join · Recents on this device  
2. **Create** — Nickname · destination search/map · join mode · optional PIN · Create  
3. **Lobby** — Large code + copy link · player list · pending approvals · Host: Start  
4. **Live race** — Map (self, rivals, destination) · ranking strip · own time · distance to dest  
5. **Results** — Podium · times · segments · copy summary · back home  

### Happy path

```text
Host: Home → Create → Lobby (code/link)
Guest: /r/{code} → nickname [→ PIN] [→ wait approval] → Lobby
Host: Start → COUNTDOWN → RACING
GPS + Socket.IO positions; server detects finish radius
First finish → place 1; others continue
All finished or host closes → FINISHED → Results + RaceResult payload
```

### Device-local data

- `clientId` UUID  
- Last nickname  
- Recents: `{ code, raceId, role, nickname, finishedAt? }[]`  
- Active `wsToken` for current race (memory + sessionStorage preferred over long-lived localStorage if possible)

---

## 6. Domain model (Prisma)

### Enums

- `RaceStatus`: `LOBBY` | `COUNTDOWN` | `RACING` | `FINISHED` | `CANCELLED`  
- `JoinMode`: `OPEN` | `APPROVAL`  
- `ParticipantStatus`: `PENDING` | `ACTIVE` | `REJECTED` | `LEFT` | `FINISHED`

### Entities

**Race**

- `id`, `code` (unique, 6 chars, ambiguous-safe alphabet), `status`, `joinMode`
- `pinHash` optional (argon2/bcrypt of 4-digit PIN)
- `destLat`, `destLng`, `destLabel?`
- `hostClientId`, `startedAt?`, `finishedAt?`, `finishRadiusM` default 80
- timestamps

**Participant**

- `id`, `raceId`, `clientId`, `nickname`, `isHost`, `status`, `color?`
- `startLat?`, `startLng?` (snapshot when race starts)
- `finishedAt?`, `durationMs?`, `joinedAt`
- unique `(raceId, clientId)`

**PositionSample**

- `raceId`, `participantId`, `lat`, `lng`, `accuracyM?`, `recordedAt`
- Indexed for post-race segment computation
- Written with throttle (not every WS message)

**RaceResult**

- `raceId` unique, `payload` JSON (ranking + segments + dest snapshot), `createdAt`

### Result payload shape

```json
{
  "ranking": [
    { "participantId": "...", "nickname": "Alex", "durationMs": 612000, "place": 1 }
  ],
  "segments": {
    "<participantId>": [
      { "index": 0, "fromPct": 0, "toPct": 25, "durationMs": 120000, "distanceM": 2100 }
    ]
  },
  "dest": { "lat": 0, "lng": 0, "label": "..." }
}
```

Segments: walk each participant’s ordered samples; compute cumulative distance; split into four bands (0–25%, 25–50%, 50–75%, 75–100% of total path distance); sum time in each band. Highlight slowest/fastest band in UI.

---

## 7. REST API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/races` | Create race; returns race + host participant + `wsToken` |
| `GET` | `/races/:code` | Public lobby snapshot (no pin, limited PII) |
| `POST` | `/races/:code/join` | Join; returns participant + `wsToken` |
| `POST` | `/races/:id/approve` | Host accept/reject (`APPROVAL` mode) |
| `POST` | `/races/:id/start` | Host start (also allowed via WS with ack) |
| `POST` | `/races/:id/finish` | Host force-complete |
| `GET` | `/races/:code/results` | Final results |
| `GET` | `/geo/search?q=` | Photon proxy |

All mutating race actions that require host verify `hostClientId` / host `wsToken` claims.

### Create body (conceptual)

- `nickname`, `clientId`, `destLat`, `destLng`, `destLabel?`, `joinMode`, `pin?`

### Join body

- `nickname`, `clientId`, `pin?`

---

## 8. WebSocket design (Socket.IO)

Guidance applied from **websocket-engineer** skill: rooms, handshake auth, heartbeat, rate limits, client reconnect queue, server not sole large state store, single-node MVP with Redis path later.

### Connection

```text
io(API_URL, { auth: { wsToken } })
```

- `wsToken`: short-lived JWT signed by Nest after create/join.  
- Claims: `{ raceId, participantId, clientId, isHost }`.  
- Middleware rejects missing/invalid tokens before full connection.  
- On success: `socket.join('race:' + raceId)`.

### Client → server

| Event | Payload | Notes |
|-------|---------|--------|
| `race:join` | `{ }` or empty after auth | Optional re-sync hook; room already joined via auth |
| `race:position` | `{ lat, lng, accuracy?, t }` | Rate-limited ~1 / 1.5–2 s |
| `host:start` | `{}` | Host only; **ack** |
| `host:approve` | `{ participantId, accept }` | Host only |
| `host:finish` | `{}` | Host only; **ack** |

### Server → clients (room `race:{raceId}`)

| Event | Payload |
|-------|---------|
| `race:state` | Full snapshot (status, participants, dest, startedAt…) |
| `race:participant` | Single participant upsert |
| `race:countdown` | `{ endsAt }` |
| `race:started` | `{ startedAt }` |
| `race:positions` | Map of latest `{ lat, lng, t }` per active racer |
| `race:finished_one` | `{ participantId, place, durationMs }` |
| `race:completed` | `{ results }` |
| `race:error` | `{ code, message }` |

### Server rules

1. **Source of truth:** PostgreSQL for race lifecycle and ranking.  
2. **Hot cache:** in-memory last position per participant for broadcast.  
3. **Finish:** if `haversine(pos, dest) ≤ finishRadiusM` and status `RACING` and participant `ACTIVE` → set `FINISHED`, `durationMs = now - race.startedAt`, assign `place` by order.  
4. **Disconnect:** presence grace **30 s** before marking `LEFT` (avoid flaky mobile networks).  
5. **Batch:** emit `race:positions` ~every 1 s, not per inbound message.  
6. **Persist samples:** write `PositionSample` on throttle (e.g. every 3–5 s or 50 m).  
7. **Complete race:** all non-left participants finished **or** host finish → compute segments → `RaceResult` → `FINISHED` → `race:completed`.

### Scaling (post-MVP)

- Sticky sessions at load balancer.  
- Socket.IO Redis adapter.  
- Still one logical room per race; no change to client event contract.

### Client resilience

- Connection states: `connecting | live | reconnecting | offline`.  
- Queue last position(s) while disconnected; on reconnect flush last known + wait for `race:state`.  
- Re-subscribe `watchPosition` after app resume.

Shared TypeScript event contracts live in `packages/shared` and are imported by both apps.

---

## 9. Security and abuse (no accounts)

- PIN stored only as hash; never returned by API.  
- Host actions require host token claims.  
- Rate limit: join, geo search, WS positions.  
- Codes: 6-char from unambiguous alphabet; join rate-limited to reduce enumeration.  
- CORS locked to web origin(s).  
- No public Docker port binds: Postgres and API only as designed in §11.  
- Do not expose full historical tracks in `LOBBY`; live positions only in `RACING`/`COUNTDOWN` as needed.

---

## 10. PWA requirements

- Web app manifest: name **Carrera de Tiempo**, icons, `display: standalone`, theme color.  
- Service worker via Serwist or equivalent for shell offline; **live race requires network**.  
- Permissions: geolocation only when entering lobby/race; clear copy why.  
- Mobile-first; large tap targets; readable in sunlight (high contrast).  
- Works on modern mobile Chrome/Safari; install prompt optional UX.

---

## 11. Deployment and Docker

Follow global rule: **never publish container ports on all interfaces**.

```yaml
# Example policy for compose
services:
  db:
    image: postgres:16
    # no public ports, or only:
    ports:
      - "127.0.0.1:5432:5432"
  api:
    # prefer internal network only; host access:
    ports:
      - "127.0.0.1:3001:3001"
  web:
    ports:
      - "127.0.0.1:3000:3000"
```

- Cross-service: use Docker DNS names (`db`, `api`).  
- Public access later via reverse proxy / Tailscale / tunnel — not raw `0.0.0.0` binds.  
- Env: `DATABASE_URL`, `JWT_WS_SECRET`, `PHOTON_URL` (default public Photon), `CORS_ORIGIN`, `FINISH_RADIUS_M`.

---

## 12. Error handling (product-facing)

| Situation | Behavior |
|-----------|----------|
| GPS denied | Block start of race UX with clear fix steps; lobby allowed with warning |
| GPS stale / low accuracy | Show warning; still allow race; do not fake positions |
| Invalid PIN | Join error, stay on join form |
| Host rejects | Message + return home |
| Race already started when joining | Reject join (MVP: no mid-race join) |
| Race finished | Deep link opens results |
| WS reconnect | Banner “Reconectando…”; map freezes rivals until live |
| Photon down | Allow map pin / reverse coords only; degrade search |
| Host disconnects mid-race | Race continues; any ACTIVE host token holder can finish if still host record (host is fixed at create) |

---

## 13. Testing strategy

- **Unit:** haversine, finish detection, segment split, code generation, rate limiter.  
- **API integration:** create → join → start → finish → results (supertest + test DB).  
- **WS integration:** connect with valid/invalid `wsToken`; position rate limit; host start ack; finish order.  
- **E2E (later):** Playwright two browsers mock geolocation.  
- **Manual:** install PWA on phone; real GPS short race to a nearby point.

---

## 14. Implementation phases (for planning skill)

1. Monorepo scaffold (Turborepo, Next, Nest, Prisma, shared, compose Postgres).  
2. Race REST lifecycle + Prisma models.  
3. Socket.IO gateway + lobby/start/positions/finish.  
4. Web UI: home, create, join, lobby.  
5. MapLibre live map + geolocation + geo search.  
6. Results + segments + recents + PWA manifest/SW.  
7. Hardening: rate limits, reconnect UX, Docker polish.

---

## 15. Open decisions for implementation (defaults set)

| Item | Default |
|------|---------|
| Package manager | pnpm |
| WS library | Socket.IO |
| ORM | Prisma |
| JWT lib | whatever Nest commonly uses (`@nestjs/jwt`) |
| PIN hash | argon2 or bcrypt |
| Mid-race join | **Disallowed** in MVP |
| Max participants | Soft cap **20** per race |
| Code alphabet | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I/O/0/1) |

---

## 16. Spec self-review notes

- No TBDs left for core MVP behavior.  
- Architecture matches product: free maps, no Google, no accounts, WS rooms per race.  
- Scope is one product MVP; multi-region / Redis deferred.  
- Ambiguity resolved: free starts, host countdown, 80 m finish, 4 segments by path distance, OPEN vs APPROVAL, history by race on server.

---

## 17. Next step after approval

Invoke **writing-plans** to produce an implementation plan under `docs/superpowers/plans/`, then implement phase by phase.
