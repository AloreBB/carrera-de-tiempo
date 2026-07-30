import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_MS,
  DISCONNECT_GRACE_MS,
  FINISH_RADIUS_M_DEFAULT,
  MAX_PARTICIPANTS,
  POSITION_BATCH_MS,
  POSITION_MIN_INTERVAL_MS,
  POSITION_MIN_MOVE_M,
  SEGMENT_COUNT,
} from "./types";

/**
 * Invariants used by timing / race rules.
 * durationMs = finishedAt − startedAt is timezone-independent (epoch ms).
 */
describe("race timing & limit constants", () => {
  it("countdown is exactly 3 seconds", () => {
    expect(COUNTDOWN_MS).toBe(3_000);
  });

  it("finish radius default is 80m (Waze-style destination)", () => {
    expect(FINISH_RADIUS_M_DEFAULT).toBe(80);
  });

  it("counter: max participants cap", () => {
    expect(MAX_PARTICIPANTS).toBe(20);
    expect(MAX_PARTICIPANTS).toBeGreaterThan(1);
  });

  it("segment count is 4 tramos", () => {
    expect(SEGMENT_COUNT).toBe(4);
  });

  it("position throttle constants are positive and ordered", () => {
    expect(POSITION_MIN_INTERVAL_MS).toBeGreaterThan(0);
    expect(POSITION_BATCH_MS).toBeGreaterThan(0);
    expect(POSITION_MIN_MOVE_M).toBeGreaterThan(0);
    expect(DISCONNECT_GRACE_MS).toBeGreaterThan(COUNTDOWN_MS);
  });

  it("duration formula is timezone-agnostic (epoch delta)", () => {
    // Simulate Colombia UTC-5 vs UTC wall clocks with same instants
    const startedAt = Date.parse("2026-07-30T15:00:00.000Z");
    const finishedAt = Date.parse("2026-07-30T15:12:34.567Z");
    const durationMs = finishedAt - startedAt;
    expect(durationMs).toBe(12 * 60_000 + 34_000 + 567);

    // Same instants labeled in local offset still share epoch
    const coStart = new Date("2026-07-30T10:00:00-05:00").getTime();
    const coEnd = new Date("2026-07-30T10:12:34.567-05:00").getTime();
    expect(coEnd - coStart).toBe(durationMs);
  });
});
