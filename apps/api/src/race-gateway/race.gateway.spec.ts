import { describe, it, expect, beforeAll } from "vitest";
import { io as ioc, Socket } from "socket.io-client";
import { randomUUID } from "crypto";
import { WS_EVENTS } from "@carrera/shared";

const API = process.env.API_URL ?? "http://127.0.0.1:3001";

async function apiUp(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

describe("RaceGateway WS (live API)", () => {
  let up = false;

  beforeAll(async () => {
    up = await apiUp();
  });

  it("starts race and finishes when near destination", async () => {
    if (!up) {
      console.warn("API not running on :3001 — skip WS live test");
      return;
    }

    const hostId = randomUUID();
    const createRes = await fetch(`${API}/api/races`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "H",
        clientId: hostId,
        destLat: 40.0,
        destLng: -3.0,
        joinMode: "OPEN",
      }),
    });
    expect(createRes.ok).toBe(true);
    const created = (await createRes.json()) as {
      race: { id: string };
      wsToken: string;
    };

    const socket: Socket = await new Promise((resolve, reject) => {
      const s = ioc(API, {
        auth: { wsToken: created.wsToken },
        transports: ["websocket"],
        forceNew: true,
      });
      s.on("connect", () => resolve(s));
      s.on("connect_error", reject);
    });

    await new Promise<void>((resolve) => {
      socket.on(WS_EVENTS.RACE_STATE, () => resolve());
    });

    const startAck = await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit(WS_EVENTS.HOST_START, {}, (ack: { ok: boolean }) =>
        resolve(ack ?? { ok: false }),
      );
    });
    expect(startAck.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 3200));

    const finished = new Promise<void>((resolve) => {
      socket.on(WS_EVENTS.RACE_FINISHED_ONE, () => resolve());
    });

    socket.emit(WS_EVENTS.RACE_POSITION, {
      lat: 40.0,
      lng: -3.0,
      t: Date.now(),
    });

    await finished;
    socket.disconnect();
  }, 25_000);
});
