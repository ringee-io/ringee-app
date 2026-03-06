import { IsString, IsNotEmpty, IsUUID, IsOptional } from "class-validator";

export class InitiateCallDto {
  @IsString()
  @IsNotEmpty()
  from!: string;

  @IsString()
  @IsNotEmpty()
  to!: string;
}

export class CallControlDto {
  @IsString()
  @IsNotEmpty()
  callControlId!: string;
}

export class CallRecordingDto extends CallControlDto {
  @IsUUID()
  @IsOptional()
  recordingId?: string;
}
