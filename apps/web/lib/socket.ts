"use client";

import { io, Socket } from "socket.io-client";
import { WS_EVENTS } from "@carrera/shared";

let socket: Socket | null = null;
let socketToken: string | null = null;

function socketOrigin(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // Dev: talk to Nest directly (Next rewrites do not upgrade WS reliably).
  // Prod: same origin; Traefik should route /socket.io → API (not via Next).
  return process.env.NEXT_PUBLIC_API_URL || undefined;
}

/**
 * Singleton Socket.IO client. Reuses the same connection while the token
 * is unchanged — never tear down mid-handshake (that left the UI on
 * "Conectando…" forever when race.status changed).
 */
export function getSocket(wsToken: string): Socket {
  if (socket && socketToken === wsToken) {
    if (!socket.connected && !socket.active) {
      socket.connect();
    }
    return socket;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socketToken = wsToken;
  socket = io(socketOrigin(), {
    path: "/socket.io",
    auth: { wsToken },
    // Polling first is more reliable behind reverse proxies; upgrade after.
    transports: ["polling", "websocket"],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    timeout: 15_000,
    withCredentials: true,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socketToken = null;
}

export { WS_EVENTS };
