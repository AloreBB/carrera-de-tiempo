import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

@Controller("health")
export class HealthController {
  /** Load balancers / probes — do not burn rate limit budget */
  @Get()
  @SkipThrottle()
  health() {
    return { ok: true, service: "carrera-de-tiempo-api" };
  }
}
