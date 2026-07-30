import { Injectable, ServiceUnavailableException } from "@nestjs/common";

interface CacheEntry {
  at: number;
  data: unknown;
}

@Injectable()
export class GeoService {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 60_000;
  private lastRequestAt = 0;

  async search(q: string) {
    const query = q.trim();
    if (query.length < 2) return [];

    const key = query.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) {
      return hit.data;
    }

    // fair-use throttle ~1 req/s to public Photon
    const wait = 1100 - (Date.now() - this.lastRequestAt);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestAt = Date.now();

    const base = process.env.PHOTON_URL ?? "https://photon.komoot.io";
    const url = `${base}/api/?q=${encodeURIComponent(query)}&limit=6&lang=es`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "CarreraDeTiempo/0.1 (local-dev)" },
      });
      if (!res.ok) {
        throw new ServiceUnavailableException("Geocoding no disponible");
      }
      const json = (await res.json()) as {
        features?: Array<{
          geometry: { coordinates: [number, number] };
          properties: {
            name?: string;
            city?: string;
            country?: string;
            street?: string;
            housenumber?: string;
          };
        }>;
      };

      const data = (json.features ?? []).map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const label = [p.name, p.street, p.housenumber, p.city, p.country]
          .filter(Boolean)
          .join(", ");
        return { lat, lng, label: label || `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
      });

      this.cache.set(key, { at: Date.now(), data });
      return data;
    } catch {
      throw new ServiceUnavailableException("Geocoding no disponible");
    }
  }
}
