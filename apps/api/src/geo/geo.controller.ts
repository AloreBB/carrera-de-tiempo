import {
  BadRequestException,
  Controller,
  Get,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { GeoService } from "./geo.service";

@Controller("geo")
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  /** Geocode is external + abusable — keep tight */
  @Get("search")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  search(@Query("q") q = "") {
    const query = String(q).trim();
    if (query.length < 2 || query.length > 120) {
      throw new BadRequestException("query inválida");
    }
    // block obvious injection noise / control chars
    if (/[\u0000-\u001f\u007f]/.test(query)) {
      throw new BadRequestException("query inválida");
    }
    return this.geo.search(query);
  }

  @Get("reverse")
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  reverse(@Query("lat") lat = "", @Query("lng") lng = "") {
    const la = Number(lat);
    const ln = Number(lng);
    if (
      Number.isNaN(la) ||
      Number.isNaN(ln) ||
      la < -90 ||
      la > 90 ||
      ln < -180 ||
      ln > 180
    ) {
      throw new BadRequestException("coordenadas inválidas");
    }
    return this.geo.reverse(la, ln);
  }
}
