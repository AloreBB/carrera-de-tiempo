import type { LatLng, PositionSamplePoint, SegmentStat } from "./types";
import { SEGMENT_COUNT } from "./types";

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in meters (Haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinRadius(
  point: LatLng,
  center: LatLng,
  radiusM: number,
): boolean {
  return haversineMeters(point, center) <= radiusM;
}

/**
 * Split a track into `segmentCount` equal distance bands.
 * Returns empty array if fewer than 2 samples or total distance is 0.
 */
export function splitTrackIntoSegments(
  samples: PositionSamplePoint[],
  segmentCount: number = SEGMENT_COUNT,
): SegmentStat[] {
  if (samples.length < 2 || segmentCount < 1) return [];

  const ordered = [...samples].sort((a, b) => a.recordedAt - b.recordedAt);
  const edgeDist: number[] = [0];
  for (let i = 1; i < ordered.length; i++) {
    edgeDist.push(
      edgeDist[i - 1] + haversineMeters(ordered[i - 1], ordered[i]),
    );
  }
  const totalDist = edgeDist[edgeDist.length - 1];
  if (totalDist <= 0) {
    const durationMs = Math.max(
      0,
      ordered[ordered.length - 1].recordedAt - ordered[0].recordedAt,
    );
    return Array.from({ length: segmentCount }, (_, index) => ({
      index,
      fromPct: (index / segmentCount) * 100,
      toPct: ((index + 1) / segmentCount) * 100,
      durationMs: index === 0 ? durationMs : 0,
      distanceM: 0,
    }));
  }

  const bandDist = totalDist / segmentCount;
  const segments: SegmentStat[] = [];

  for (let s = 0; s < segmentCount; s++) {
    const startD = s * bandDist;
    const endD = (s + 1) * bandDist;
    const tStart = timeAtDistance(ordered, edgeDist, startD);
    const tEnd = timeAtDistance(ordered, edgeDist, endD);
    segments.push({
      index: s,
      fromPct: (s / segmentCount) * 100,
      toPct: ((s + 1) / segmentCount) * 100,
      durationMs: Math.max(0, tEnd - tStart),
      distanceM: bandDist,
    });
  }
  return segments;
}

function timeAtDistance(
  ordered: PositionSamplePoint[],
  edgeDist: number[],
  targetDist: number,
): number {
  if (targetDist <= 0) return ordered[0].recordedAt;
  const total = edgeDist[edgeDist.length - 1];
  if (targetDist >= total) return ordered[ordered.length - 1].recordedAt;

  for (let i = 1; i < ordered.length; i++) {
    if (edgeDist[i] >= targetDist) {
      const segLen = edgeDist[i] - edgeDist[i - 1];
      if (segLen <= 0) return ordered[i].recordedAt;
      const ratio = (targetDist - edgeDist[i - 1]) / segLen;
      const t0 = ordered[i - 1].recordedAt;
      const t1 = ordered[i].recordedAt;
      return t0 + ratio * (t1 - t0);
    }
  }
  return ordered[ordered.length - 1].recordedAt;
}
