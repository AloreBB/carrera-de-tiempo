import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApproveDto, CreateRaceDto, HostActionDto, JoinRaceDto } from "./dto";
import { RacesService } from "./races.service";

@Controller("races")
export class RacesController {
  constructor(private readonly races: RacesService) {}

  @Post()
  create(@Body() dto: CreateRaceDto) {
    return this.races.create(dto);
  }

  @Get(":code")
  getByCode(@Param("code") code: string) {
    return this.races.getByCode(code);
  }

  @Post(":code/join")
  join(@Param("code") code: string, @Body() dto: JoinRaceDto) {
    return this.races.join(code, dto);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Body() dto: ApproveDto) {
    return this.races.approve(id, dto);
  }

  @Post(":id/start")
  start(@Param("id") id: string, @Body() dto: HostActionDto) {
    return this.races.start(id, dto.clientId);
  }

  @Post(":id/finish")
  finish(@Param("id") id: string, @Body() dto: HostActionDto) {
    return this.races.forceFinish(id, dto.clientId);
  }

  @Get(":code/results")
  async results(@Param("code") code: string) {
    const data = await this.races.getByCode(code);
    return { race: data.race, result: data.result, participants: data.participants };
  }
}
