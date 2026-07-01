import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateFreeTrialRequestDto {
  /** Optional message from the user about how they plan to use Ringee. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
