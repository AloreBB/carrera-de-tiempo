import { describe, expect, it } from "vitest";
import {
  haversineMeters,
  isWithinRadius,
  splitTrackIntoSegments,
} from "./geo";
import {
  FINISH_RADIUS_M_DEFAULT,
  SEGMENT_COUNT,
  type PositionSamplePoint,
} from "./types";

/** ~1 degree latitude ≈ 111_195 m */
const DEG_LAT_M = 111_195;

describe("haversineMeters", () => {
  it("positive: same point → ~0", () => {
    // Arrange
    const p = { lat: 40.4, lng: -3.7 };

    // Act
    const d = haversineMeters(p, p);

    // Assert
    expect(d).toBeLessThan(0.01);
    expect(d).toBeGreaterThanOrEqual(0);
  });

  it("positive: ~111km per degree latitude at equator", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("positive: distance is symmetric", () => {
    const a = { lat: 4.711, lng: -74.072 }; // Bogotá-ish
    const b = { lat: 6.247, lng: -75.566 }; // Medellín-ish
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("boundary: antipodal-ish points stay finite (clamped asin)", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 179.9 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });

  it("counter: zero delta lat/lng yields zero", () => {
    expect(haversineMeters({ lat: -10, lng: 20 }, { lat: -10, lng: 20 })).toBe(
      0,
    );
  });
});

describe("isWithinRadius (finish zone)", () => {
  const dest = { lat: 40.4168, lng: -3.7038 };

  it("positive: point inside FINISH_RADIUS_M_DEFAULT", () => {
    // ~11m north (~0.0001°)
    const near = { lat: 40.4169, lng: -3.7038 };
    expect(isWithinRadius(near, dest, FINISH_RADIUS_M_DEFAULT)).toBe(true);
  });

  it("negative: point far outside 80m", () => {
    const far = { lat: 40.42, lng: -3.71 };
    expect(isWithinRadius(far, dest, FINISH_RADIUS_M_DEFAULT)).toBe(false);
  });

  it("boundary: exactly at radius counts as inside (<=)", () => {
    // Move north by radius / deg ≈ meters / 111195
    const deltaLat = FINISH_RADIUS_M_DEFAULT / DEG_LAT_M;
    const onEdge = { lat: dest.lat + deltaLat, lng: dest.lng };
    const dist = haversineMeters(onEdge, dest);
    // Allow small haversine vs flat approximation error
    expect(dist).toBeLessThan(FINISH_RADIUS_M_DEFAULT + 2);
    expect(isWithinRadius(onEdge, dest, dist)).toBe(true);
    expect(isWithinRadius(onEdge, dest, Math.max(0, dist - 0.01))).toBe(false);
  });

  it("boundary: radius 0 only accepts exact center", () => {
    expect(isWithinRadius(dest, dest, 0)).toBe(true);
    expect(
      isWithinRadius({ lat: dest.lat + 0.00001, lng: dest.lng }, dest, 0),
    ).toBe(false);
  });

  it("negative: negative radius never contains a distinct point", () => {
    // haversine >= 0, so <= negative only if both 0 and radius >= 0 effectively false for moved point
    expect(
      isWithinRadius({ lat: dest.lat + 0.01, lng: dest.lng }, dest, -1),
    ).toBe(false);
  });
});

describe("splitTrackIntoSegments", () => {
  const northTrack = (steps: number, stepDeg = 0.0009, dtMs = 60_000) =>
    Array.from({ length: steps + 1 }, (_, i) => ({
      lat: i * stepDeg,
      lng: 0,
      recordedAt: i * dtMs,
    }));

  it("negative: empty samples → []", () => {
    expect(splitTrackIntoSegments([])).toEqual([]);
  });

  it("negative: single sample → []", () => {
    expect(
      splitTrackIntoSegments([{ lat: 0, lng: 0, recordedAt: 0 }]),
    ).toEqual([]);
  });

  it("negative: segmentCount < 1 → []", () => {
    expect(splitTrackIntoSegments(northTrack(4), 0)).toEqual([]);
    expect(splitTrackIntoSegments(northTrack(4), -2)).toEqual([]);
  });

  it("positive: splits into SEGMENT_COUNT equal distance bands", () => {
    // Arrange — ~400m in 4 steps
    const samples = northTrack(4);

    // Act
    const segs = splitTrackIntoSegments(samples, SEGMENT_COUNT);

    // Assert
    expect(segs).toHaveLength(SEGMENT_COUNT);
    expect(segs[0].fromPct).toBe(0);
    expect(segs[SEGMENT_COUNT - 1].toPct).toBe(100);
    expect(segs.every((s, i) => s.index === i)).toBe(true);

    const totalTime = segs.reduce((acc, s) => acc + s.durationMs, 0);
    expect(totalTime).toBeGreaterThan(200_000);
    expect(totalTime).toBeLessThanOrEqual(240_000);

    // Counter: each band same distance
    const d0 = segs[0].distanceM;
    for (const s of segs) {
      expect(s.distanceM).toBeCloseTo(d0, 5);
    }
  });

  it("positive: zero distance (stationary) puts duration on segment 0", () => {
    const samples: PositionSamplePoint[] = [
      { lat: 1, lng: 1, recordedAt: 1_000 },
      { lat: 1, lng: 1, recordedAt: 5_000 },
    ];
    const segs = splitTrackIntoSegments(samples, 4);
    expect(segs).toHaveLength(4);
    expect(segs[0].durationMs).toBe(4_000);
    expect(segs[0].distanceM).toBe(0);
    expect(segs.slice(1).every((s) => s.durationMs === 0)).toBe(true);
    expect(segs.slice(1).every((s) => s.distanceM === 0)).toBe(true);
  });

  it("positive: sorts samples by recordedAt before splitting", () => {
    const ordered = northTrack(4);
    const shuffled = [ordered[2], ordered[0], ordered[4], ordered[1], ordered[3]];
    const a = splitTrackIntoSegments(ordered, 4);
    const b = splitTrackIntoSegments(shuffled, 4);
    expect(b.map((s) => s.durationMs)).toEqual(a.map((s) => s.durationMs));
  });

  it("counter: sum of from/to percentages covers 0→100 without gaps", () => {
    const segs = splitTrackIntoSegments(northTrack(8), 4);
    expect(segs[0].fromPct).toBe(0);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].fromPct).toBe(segs[i - 1].toPct);
    }
    expect(segs.at(-1)!.toPct).toBe(100);
  });

  it("boundary: segmentCount 1 yields single 0–100 band", () => {
    const segs = splitTrackIntoSegments(northTrack(2), 1);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ index: 0, fromPct: 0, toPct: 100 });
    expect(segs[0].durationMs).toBeGreaterThan(0);
  });
});
