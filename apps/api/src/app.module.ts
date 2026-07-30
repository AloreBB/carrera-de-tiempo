import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./prisma/prisma.module";
import { RacesModule } from "./races/races.module";
import { GeoModule } from "./geo/geo.module";
import { HealthController } from "./health.controller";
import { RaceGatewayModule } from "./race-gateway/race-gateway.module";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_WS_SECRET ?? "dev-carrera-ws-secret-change-me",
      signOptions: { expiresIn: "24h" },
    }),
    RacesModule,
    GeoModule,
    RaceGatewayModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
