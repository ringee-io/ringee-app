import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  Matches,
  IsArray,
} from "class-validator";

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: "color must be a valid hex color (e.g., #3B82F6)",
  })
  color?: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: "color must be a valid hex color (e.g., #3B82F6)",
  })
  color?: string;
}

export class AssignTagsDto {
  @IsArray()
  @IsString({ each: true })
  tagIds!: string[];
}
