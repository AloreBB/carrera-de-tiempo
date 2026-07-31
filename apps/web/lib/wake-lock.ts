/**
 * Keep the screen on during a live race (browser / installed PWA).
 * Uses the Screen Wake Lock API when available; no-ops otherwise.
 */

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

let sentinel: WakeLockSentinelLike | null = null;
let wantActive = false;

async function request(): Promise<void> {
  if (typeof navigator === "undefined") return;
  const wl = (
    navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    }
  ).wakeLock;
  if (!wl) return;

  try {
    if (sentinel && !sentinel.released) return;
    sentinel = await wl.request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
      // Re-acquire after system release (tab visible again, etc.)
      if (wantActive && document.visibilityState === "visible") {
        void request();
      }
    });
  } catch {
    // Denied / unsupported (e.g. low battery, non-secure context)
    sentinel = null;
  }
}

export async function acquireWakeLock(): Promise<void> {
  wantActive = true;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }
  await request();
}

export async function releaseWakeLock(): Promise<void> {
  wantActive = false;
  if (sentinel && !sentinel.released) {
    try {
      await sentinel.release();
    } catch {
      /* ignore */
    }
  }
  sentinel = null;
}

/** Call once from the race page to re-lock when the user returns to the tab. */
export function bindWakeLockVisibility(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const onVis = () => {
    if (wantActive && document.visibilityState === "visible") {
      void request();
    }
  };
  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
}
