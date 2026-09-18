import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import {
  CurrentUser,
  CurrentUserData,
  OrgAdminOnly,
  AllowOrgMember,
  createOwnershipContext,
} from "@ringee/platform";
import { ExternalCarrierService } from "@ringee/services";

class CarrierDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}

/** Full desired configuration. Omitted password preserves the stored secret. */
class EndpointDto {
  @IsString() @MinLength(1) @MaxLength(64) extension!: string;
  @IsString() @MinLength(1) @MaxLength(260) proxy!: string;
  @IsString() @MinLength(1) @MaxLength(128) sipUsername!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password?: string;
  @IsIn(["UDP", "TCP", "TLS"]) transport!: "UDP" | "TCP" | "TLS";
  @IsOptional() @IsString() @MaxLength(128) authUsername?: string | null;
  @IsOptional() @IsString() @MaxLength(128) fromUser?: string | null;
  @IsOptional() @IsString() @MaxLength(260) outboundProxy?: string | null;
  @IsOptional() @IsInt() @Min(60) @Max(86400) expirationSec?: number;
}

class ExternalNumberDto {
  @IsUUID() endpointId!: string;
  @IsString() @MinLength(1) @MaxLength(40) phoneNumber!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;
  /** Desk phone its inbound calls ring; null stops routing them. */
  @IsOptional() @IsUUID() inboundSipDeviceId?: string | null;
}

@OrgAdminOnly()
@Controller("external-carriers")
export class ExternalCarrierController {
  constructor(private readonly service: ExternalCarrierService) {}

  /** Numbers a member may call from in the web dialer. */
  @AllowOrgMember()
  @Get("calling-numbers")
  callingNumbers(@CurrentUser() user: CurrentUserData) {
    return this.service.listCallingNumbers(createOwnershipContext(user));
  }

  /** Desk phones an external number's inbound calls can be routed to. */
  @Get("inbound-desk-phones")
  inboundDeskPhones(@CurrentUser() user: CurrentUserData) {
    return this.service.listInboundDeskPhones(createOwnershipContext(user));
  }

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.service.list(createOwnershipContext(user));
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() body: CarrierDto) {
    return this.service.createCarrier(createOwnershipContext(user), body.name);
  }

  @Patch(":carrierId")
  update(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) id: string,
    @Body() body: CarrierDto,
  ) {
    return this.service.updateCarrier(
      createOwnershipContext(user),
      id,
      body.name,
    );
  }

  @Delete(":carrierId")
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) id: string,
  ) {
    return this.service.deleteCarrier(createOwnershipContext(user), id);
  }

  @Post(":carrierId/endpoints")
  createEndpoint(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) carrierId: string,
    @Body() body: EndpointDto,
  ) {
    return this.service.createEndpoint(
      createOwnershipContext(user),
      carrierId,
      body,
    );
  }

  @Patch(":carrierId/endpoints/:id")
  updateEndpoint(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) carrierId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: EndpointDto,
  ) {
    return this.service.updateEndpoint(
      createOwnershipContext(user),
      carrierId,
      id,
      body,
    );
  }

  @Post(":carrierId/endpoints/:id/sync")
  sync(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) carrierId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.syncEndpoint(
      createOwnershipContext(user),
      carrierId,
      id,
    );
  }

  @Post(":carrierId/endpoints/:id/check-registration")
  check(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) carrierId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.refreshRegistration(
      createOwnershipContext(user),
      carrierId,
      id,
    );
  }

  @Delete(":carrierId/endpoints/:id")
  removeEndpoint(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) carrierId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.deleteEndpoint(
      createOwnershipContext(user),
      carrierId,
      id,
    );
  }

  @Post(":carrierId/numbers")
  createNumber(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) carrierId: string,
    @Body() body: ExternalNumberDto,
  ) {
    return this.service.saveNumber(
      createOwnershipContext(user),
      carrierId,
      body,
    );
  }

  @Patch(":carrierId/numbers/:id")
  updateNumber(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) carrierId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ExternalNumberDto,
  ) {
    return this.service.saveNumber(
      createOwnershipContext(user),
      carrierId,
      body,
      id,
    );
  }

  @Delete(":carrierId/numbers/:id")
  removeNumber(
    @CurrentUser() user: CurrentUserData,
    @Param("carrierId", ParseUUIDPipe) carrierId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.deleteNumber(
      createOwnershipContext(user),
      carrierId,
      id,
    );
  }
}
