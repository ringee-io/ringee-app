import { IsString, IsNotEmpty, IsOptional, IsIn } from "class-validator";

export class RequestCallerIdVerificationDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(["sms", "call"])
  method!: "sms" | "call";

  @IsString()
  @IsOptional()
  extension?: string;
}

export class VerifyCallerIdDto {
  @IsString()
  @IsNotEmpty()
  verificationCode!: string;
}
