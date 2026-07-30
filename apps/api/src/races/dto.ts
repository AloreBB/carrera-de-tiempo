import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateRaceDto {
  @IsString()
  @MaxLength(32)
  nickname!: string;

  @IsUUID()
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
  @Length(4, 4)
  pin?: string;
}

export class JoinRaceDto {
  @IsString()
  @MaxLength(32)
  nickname!: string;

  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  @Length(4, 4)
  pin?: string;
}

export class ApproveDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  participantId!: string;

  @IsBoolean()
  accept!: boolean;
}

export class HostActionDto {
  @IsUUID()
  clientId!: string;
}
