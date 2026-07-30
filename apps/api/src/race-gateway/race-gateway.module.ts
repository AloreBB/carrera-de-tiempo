import { Module } from "@nestjs/common";
import { RacesModule } from "../races/races.module";
import { RaceGateway } from "./race.gateway";

@Module({
  imports: [RacesModule],
  providers: [RaceGateway],
})
export class RaceGatewayModule {}
