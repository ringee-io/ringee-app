import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  MaxLength,
} from "class-validator";

export class CreateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phoneNumber!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  organization?: string;

  @IsOptional()
  @IsString({ each: true })
  tagIds?: string[];
}

export class UpdateContactDto extends CreateContactDto {}

export class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}
