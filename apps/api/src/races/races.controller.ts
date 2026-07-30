import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApproveDto,
  CreateRaceDto,
  HostActionDto,
  JoinRaceDto,
  RaceCodeParamDto,
  RaceIdParamDto,
} from "./dto";
import { RacesService } from "./races.service";

@Controller("races")
export class RacesController {
  constructor(private readonly races: RacesService) {}

  /** Create race — stricter limit to reduce room spam bots */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() dto: CreateRaceDto) {
    return this.races.create(dto);
  }

  @Get(":code")
  getByCode(@Param() params: RaceCodeParamDto) {
    return this.races.getByCode(params.code);
  }

  @Post(":code/join")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  join(@Param() params: RaceCodeParamDto, @Body() dto: JoinRaceDto) {
    return this.races.join(params.code, dto);
  }

  @Post(":id/approve")
  approve(@Param() params: RaceIdParamDto, @Body() dto: ApproveDto) {
    return this.races.approve(params.id, dto);
  }

  @Post(":id/start")
  start(@Param() params: RaceIdParamDto, @Body() dto: HostActionDto) {
    return this.races.start(params.id, dto.clientId);
  }

  @Post(":id/finish")
  finish(@Param() params: RaceIdParamDto, @Body() dto: HostActionDto) {
    return this.races.forceFinish(params.id, dto.clientId);
  }

  @Get(":code/results")
  async results(@Param() params: RaceCodeParamDto) {
    const data = await this.races.getByCode(params.code);
    return {
      race: data.race,
      result: data.result,
      participants: data.participants,
    };
  }
}
