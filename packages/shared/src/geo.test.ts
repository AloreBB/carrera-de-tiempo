import { describe, expect, it } from "vitest";
import { haversineMeters, isWithinRadius, splitTrackIntoSegments } from "./geo";
import { generateRaceCode, isValidRaceCode, normalizeRaceCode } from "./codes";

describe("haversineMeters", () => {
  it("returns ~0 for same point", () => {
    expect(haversineMeters({ lat: 40.4, lng: -3.7 }, { lat: 40.4, lng: -3.7 })).toBeLessThan(0.01);
  });

  it("measures ~111km per degree latitude", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("isWithinRadius", () => {
  it("detects finish within 80m", () => {
    const dest = { lat: 40.4168, lng: -3.7038 };
    const near = { lat: 40.4169, lng: -3.7038 };
    expect(isWithinRadius(near, dest, 80)).toBe(true);
    const far = { lat: 40.42, lng: -3.71 };
    expect(isWithinRadius(far, dest, 80)).toBe(false);
  });
});

describe("splitTrackIntoSegments", () => {
  it("returns empty for single sample", () => {
    expect(
      splitTrackIntoSegments([{ lat: 0, lng: 0, recordedAt: 0 }]),
    ).toEqual([]);
  });

  it("splits into 4 equal distance bands", () => {
    // Move north ~400m total in 4 steps of ~100m each (approx 0.0009 deg lat)
    const step = 0.0009;
    const samples = [0, 1, 2, 3, 4].map((i) => ({
      lat: i * step,
      lng: 0,
      recordedAt: i * 60_000,
    }));
    const segs = splitTrackIntoSegments(samples, 4);
    expect(segs).toHaveLength(4);
    expect(segs[0].fromPct).toBe(0);
    expect(segs[3].toPct).toBe(100);
    const totalTime = segs.reduce((s, x) => s + x.durationMs, 0);
    expect(totalTime).toBeGreaterThan(200_000);
    expect(totalTime).toBeLessThanOrEqual(240_000);
  });
});

describe("race codes", () => {
  it("generates length-6 codes from alphabet", () => {
    const code = generateRaceCode(() => 0);
    expect(code).toHaveLength(6);
    expect(isValidRaceCode(code)).toBe(true);
  });

  it("normalizes input", () => {
    expect(normalizeRaceCode(" ab12cd ")).toBe("AB12CD");
  });
});
