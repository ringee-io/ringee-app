import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  MaxLength,
  IsIn,
  IsOptional,
  IsArray,
  IsObject,
  IsBoolean,
} from "class-validator";

const RESOURCE_TYPES = [
  "TEAM_MEMBER",
  "PHONE_NUMBER",
  "SIP_DEVICE",
  "CAMPAIGN",
  "NUMBER_POOL",
  "ROUTING_RULE",
  "INTEGRATION",
] as const;

export class UpdatePositionDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

export class RenameResourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}

export class CreateConnectionDto {
  @IsUUID()
  sourceResourceId!: string;

  @IsUUID()
  targetResourceId!: string;
}

export class LinkResourceDto {
  @IsIn(RESOURCE_TYPES)
  type!: (typeof RESOURCE_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  referenceId!: string;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;
}

// ── Native build flows ──────────────────────────────────────────────────────

export class AddTeamMembersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;
}

export class SearchNumbersDto {
  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsOptional()
  @IsIn(["local", "toll_free", "mobile"])
  numberType?: "local" | "toll_free" | "mobile";

  @IsOptional()
  @IsString()
  areaCode?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class CreatePhoneCheckoutInfraDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  frontendOrigin!: string;
}

export class CompletePhoneCheckoutDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;
}

export class CreateSipDeviceInfraDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  deviceType?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  numberId?: string;

  @IsOptional()
  @IsBoolean()
  allowInbound?: boolean;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;
}

export class CreateCampaignInfraDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dialerMode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agentUserIds?: string[];

  @IsOptional()
  @IsString()
  numberPurchasedId?: string;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;
}

export class UpdateConfigurationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** CAMPAIGN settings — passed through to CampaignConfigService.updateSettings. */
  @IsOptional()
  @IsObject()
  campaignSettings?: Record<string, unknown>;

  @IsOptional()
  @IsIn(["active", "paused", "completed"])
  transition?: "active" | "paused" | "completed";

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class AssignResourceDto {
  @IsIn(RESOURCE_TYPES)
  targetType!: (typeof RESOURCE_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  targetReferenceId!: string;
}
