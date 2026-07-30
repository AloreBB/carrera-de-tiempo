import { Injectable, ServiceUnavailableException } from "@nestjs/common";

export interface GeoHit {
  lat: number;
  lng: number;
  label: string;
  subtitle: string;
  kind: "place" | "address" | "street" | "city" | "other";
}

interface CacheEntry {
  at: number;
  data: GeoHit[];
}

@Injectable()
export class GeoService {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 90_000;
  private lastRequestAt = 0;

  async reverse(lat: number, lng: number): Promise<GeoHit> {
    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return {
        lat,
        lng,
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        subtitle: "Punto en el mapa",
        kind: "other",
      };
    }

    const key = `rev:${lat.toFixed(5)},${lng.toFixed(5)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) {
      return hit.data[0] ?? {
        lat,
        lng,
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        subtitle: "Punto en el mapa",
        kind: "other",
      };
    }

    const wait = 1100 - (Date.now() - this.lastRequestAt);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestAt = Date.now();

    const base = process.env.PHOTON_URL ?? "https://photon.komoot.io";
    const url = `${base}/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&lang=en`;

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "CarreraDeTiempo/1.0 (https://carrera.alore.dev)",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        return {
          lat,
          lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          subtitle: "Punto en el mapa",
          kind: "other",
        };
      }
      const json = (await res.json()) as {
        features?: Array<{
          geometry: { coordinates: [number, number] };
          properties: Record<string, string | number | undefined>;
        }>;
      };
      const feature = json.features?.[0];
      const parsed = feature
        ? this.toHit({
            geometry: { coordinates: [lng, lat] },
            properties: feature.properties,
          })
        : null;
      const result: GeoHit = parsed ?? {
        lat,
        lng,
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        subtitle: "Punto en el mapa",
        kind: "other",
      };
      this.cache.set(key, { at: Date.now(), data: [result] });
      return result;
    } catch {
      return {
        lat,
        lng,
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        subtitle: "Punto en el mapa",
        kind: "other",
      };
    }
  }

  async search(q: string): Promise<GeoHit[]> {
    const query = q.trim();
    if (query.length < 2) return [];

    const key = query.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) {
      return hit.data;
    }

    // fair-use: public Photon ~1 req/s
    const wait = 1100 - (Date.now() - this.lastRequestAt);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestAt = Date.now();

    const base = process.env.PHOTON_URL ?? "https://photon.komoot.io";
    // Photon only supports: default, de, en, fr — never "es"
    const url = `${base}/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`;

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "CarreraDeTiempo/1.0 (https://carrera.alore.dev)",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new ServiceUnavailableException("Geocoding no disponible");
      }

      const json = (await res.json()) as {
        features?: Array<{
          geometry: { coordinates: [number, number] };
          properties: Record<string, string | number | undefined>;
        }>;
      };

      const data = (json.features ?? [])
        .map((f) => this.toHit(f))
        .filter((h): h is GeoHit => Boolean(h));

      // de-dupe similar labels
      const seen = new Set<string>();
      const unique = data.filter((h) => {
        const k = h.label.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      this.cache.set(key, { at: Date.now(), data: unique });
      return unique;
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      throw new ServiceUnavailableException("Geocoding no disponible");
    }
  }

  private toHit(f: {
    geometry: { coordinates: [number, number] };
    properties: Record<string, string | number | undefined>;
  }): GeoHit | null {
    const [lng, lat] = f.geometry.coordinates;
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    const p = f.properties;
    const name = str(p.name);
    const street = str(p.street);
    const house = str(p.housenumber);
    const city = str(p.city) || str(p.town) || str(p.village) || str(p.locality);
    const district = str(p.district) || str(p.suburb) || str(p.county);
    const state = str(p.state);
    const country = str(p.country);
    const postcode = str(p.postcode);
    const osmValue = str(p.osm_value) || str(p.type);

    const streetLine = [street, house].filter(Boolean).join(" ");
    const title =
      name ||
      streetLine ||
      city ||
      district ||
      `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const parts = [
      name && streetLine && streetLine !== name ? streetLine : null,
      city,
      district && district !== city ? district : null,
      state,
      postcode,
      country,
    ].filter(Boolean) as string[];

    // avoid repeating title in subtitle
    const subtitle = parts
      .filter((x) => x.toLowerCase() !== title.toLowerCase())
      .join(", ");

    const kind = this.classify(osmValue, { name, street, house, city });

    return {
      lat,
      lng,
      label: title,
      subtitle: subtitle || country || "Ubicación",
      kind,
    };
  }

  private classify(
    osmValue: string,
    ctx: { name: string; street: string; house: string; city: string },
  ): GeoHit["kind"] {
    const v = osmValue.toLowerCase();
    if (ctx.house || v === "house" || v === "building") return "address";
    if (ctx.street || v === "street" || v === "residential" || v === "road")
      return "street";
    if (
      v === "city" ||
      v === "town" ||
      v === "village" ||
      v === "municipality" ||
      (!ctx.name && ctx.city)
    )
      return "city";
    if (ctx.name) return "place";
    return "other";
  }
}

function str(v: string | number | undefined): string {
  if (v == null) return "";
  return String(v).trim();
}
