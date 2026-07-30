import { Controller, Get, Query } from "@nestjs/common";
import { GeoService } from "./geo.service";

@Controller("geo")
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get("search")
  search(@Query("q") q = "") {
    return this.geo.search(q);
  }

  @Get("reverse")
  reverse(@Query("lat") lat = "", @Query("lng") lng = "") {
    return this.geo.reverse(Number(lat), Number(lng));
  }
}
