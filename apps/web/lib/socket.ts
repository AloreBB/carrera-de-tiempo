"use client";

import { io, Socket } from "socket.io-client";
import { WS_EVENTS } from "@carrera/shared";

let socket: Socket | null = null;

function socketOrigin(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // Dev: talk to Nest directly (Next rewrites do not upgrade WS reliably).
  // Prod: same origin with reverse proxy on /socket.io.
  return process.env.NEXT_PUBLIC_API_URL || undefined;
}

export function getSocket(wsToken: string): Socket {
  if (socket?.connected) {
    return socket;
  }
  if (socket) {
    socket.disconnect();
  }
  socket = io(socketOrigin(), {
    path: "/socket.io",
    auth: { wsToken },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export { WS_EVENTS };
