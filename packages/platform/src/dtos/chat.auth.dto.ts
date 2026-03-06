import { IsString } from "class-validator";

export class CreateChatAuthDto {
  @IsString()
  phoneNumber!: string;
}
