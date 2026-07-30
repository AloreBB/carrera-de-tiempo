import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/** Safe display name: letters, numbers, spaces, basic punctuation — no control chars */
const NICK_RE = /^[\p{L}\p{N} ._\-']{1,32}$/u;
const PIN_RE = /^\d{4}$/;
const RACE_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/i;

export class CreateRaceDto {
  @IsString()
  @MaxLength(32)
  @Matches(NICK_RE, { message: "nickname inválido" })
  nickname!: string;

  @IsUUID("4")
  clientId!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  destLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  destLng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destLabel?: string;

  @IsIn(["OPEN", "APPROVAL"])
  joinMode!: "OPEN" | "APPROVAL";

  @IsOptional()
  @IsString()
  @Matches(PIN_RE, { message: "pin debe ser 4 dígitos" })
  pin?: string;
}

export class JoinRaceDto {
  @IsString()
  @MaxLength(32)
  @Matches(NICK_RE, { message: "nickname inválido" })
  nickname!: string;

  @IsUUID("4")
  clientId!: string;

  @IsOptional()
  @IsString()
  @Matches(PIN_RE, { message: "pin debe ser 4 dígitos" })
  pin?: string;
}

export class ApproveDto {
  @IsUUID("4")
  clientId!: string;

  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9]+$/i, { message: "participantId inválido" })
  participantId!: string;

  @IsBoolean()
  accept!: boolean;
}

export class HostActionDto {
  @IsUUID("4")
  clientId!: string;
}

export class RaceCodeParamDto {
  @IsString()
  @Length(6, 6)
  @Matches(RACE_CODE_RE, { message: "código de sala inválido" })
  code!: string;
}

export class RaceIdParamDto {
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9]+$/i, { message: "id inválido" })
  id!: string;
}
