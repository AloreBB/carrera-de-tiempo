import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./prisma/prisma.module";
import { RacesModule } from "./races/races.module";
import { GeoModule } from "./geo/geo.module";
import { HealthController } from "./health.controller";
import { RaceGatewayModule } from "./race-gateway/race-gateway.module";

function jwtSecret(): string {
  const secret = process.env.JWT_WS_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_WS_SECRET is required in production");
  }
  // Local/dev only — never a real production secret
  return "local-dev-only-not-for-production";
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      signOptions: { expiresIn: "24h" },
    }),
    RacesModule,
    GeoModule,
    RaceGatewayModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
