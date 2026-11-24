import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Contact } from "@ringee/database";
import {
  CreateContactDto,
  Public,
  PublicUpdateContactDto,
} from "@ringee/platform";
import { ContactService } from "@ringee/services";
import type { Response } from "express";
import {
  CustomIntegrationApiKeyGuard,
  type CustomIntegrationApiRequest,
} from "../guards/custom-integration-api-key.guard";
import { PublicApiRateLimitGuard } from "../guards/public-api-rate-limit.guard";
import { parsePositiveInteger } from "./public-api.query";

/** Where a contact written through the public API says it came from. */
const PUBLIC_API_SOURCE = "api";

/**
 * The server-to-server contact API (HOOK-009), for workflow tools and scripts.
 *
 * Authentication is the Custom Integration key; the workspace comes from the
 * stored integration, never from the request. Every handler delegates to
 * `ContactService`, which checks that the contact belongs to that workspace.
 */
@Public()
@UseGuards(CustomIntegrationApiKeyGuard, PublicApiRateLimitGuard)
@Controller("v1/contacts")
export class PublicContactsController {
  private readonly logger = new Logger(PublicContactsController.name);

  constructor(private readonly contacts: ContactService) {}

  @Get()
  async list(
    @Req() request: CustomIntegrationApiRequest,
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const trimmed = query?.trim();
    const { data, meta } = await this.contacts.listContacts(
      request.customIntegrationAuth.ctx,
      trimmed && trimmed !== "*" ? trimmed : undefined,
      undefined,
      parsePositiveInteger(page, "page") ?? 1,
      parsePositiveInteger(limit, "limit", 100) ?? 20,
    );
    return {
      data: data.map(toPublicContact),
      total: meta.total,
      page: meta.page,
      limit: meta.limit,
      totalPages: meta.totalPages,
    };
  }

  @Get(":contactId")
  async get(
    @Req() request: CustomIntegrationApiRequest,
    @Param("contactId", ParseUUIDPipe) contactId: string,
  ) {
    return toPublicContact(
      await this.contacts.getContactById(
        request.customIntegrationAuth.ctx,
        contactId,
      ),
    );
  }

  /** Creates a contact; a number that already has one is refused. */
  @Post()
  async create(
    @Req() request: CustomIntegrationApiRequest,
    @Body() dto: CreateContactDto,
  ) {
    const { ctx, integration } = request.customIntegrationAuth;
    const contact = await this.contacts.createContact(ctx, withSource(dto));
    this.logger.log(`contact.created integration=${integration.id}`);
    return toPublicContact(contact);
  }

  /**
   * Creates the contact for the number, or updates the one that has it. The
   * number is the key, so a retry is safe: `201` when it created one, `200`
   * when it found one.
   */
  @Put()
  async upsert(
    @Req() request: CustomIntegrationApiRequest,
    @Body() dto: CreateContactDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { ctx, integration } = request.customIntegrationAuth;
    const { contact, created } = await this.contacts.upsertContact(
      ctx,
      withSource(dto),
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    this.logger.log(
      `contact.${created ? "created" : "updated"} integration=${integration.id}`,
    );
    return { ...toPublicContact(contact), created };
  }

  @Patch(":contactId")
  async update(
    @Req() request: CustomIntegrationApiRequest,
    @Param("contactId", ParseUUIDPipe) contactId: string,
    @Body() dto: PublicUpdateContactDto,
  ) {
    const { ctx, integration } = request.customIntegrationAuth;
    const contact = await this.contacts.updateContact(ctx, contactId, {
      ...dto,
      // The patch may omit the number, and `null` would clear a required column.
      phoneNumber: dto.phoneNumber ?? undefined,
    });
    this.logger.log(`contact.updated integration=${integration.id}`);
    return toPublicContact(contact);
  }

  /**
   * Soft-deletes a contact. Destructive, so the caller must send the contact's
   * own number as `confirm_phone_number`; an id alone is not enough.
   */
  @Delete(":contactId")
  async remove(
    @Req() request: CustomIntegrationApiRequest,
    @Param("contactId", ParseUUIDPipe) contactId: string,
    @Query("confirm_phone_number") confirmPhoneNumber?: string,
  ) {
    const { ctx, integration } = request.customIntegrationAuth;
    const deleted = await this.contacts.deleteConfirmed(
      ctx,
      contactId,
      confirmPhoneNumber,
    );
    this.logger.log(`contact.deleted integration=${integration.id}`);
    return { deleted: true, id: deleted.id };
  }
}

function withSource(dto: CreateContactDto): CreateContactDto {
  return { ...dto, source: dto.source ?? PUBLIC_API_SOURCE };
}

/** The contact as the public API shows it: no ownership or provider columns. */
export function toPublicContact(contact: Contact) {
  return {
    id: contact.id,
    name: contact.name,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phoneNumber: contact.phoneNumber,
    email: contact.email,
    company: contact.company,
    jobTitle: contact.jobTitle,
    state: contact.locationRegion,
    website: contact.websiteUrl,
    revenue: contact.revenue,
    companySize: contact.companySize,
    source: contact.source,
    lastCallAt: contact.lastCallAt,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}
