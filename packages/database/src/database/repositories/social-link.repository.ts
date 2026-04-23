import { Injectable } from "@nestjs/common";
import {
  CompanySocialLink,
  ContactSocialLink,
  Prisma,
  SocialPlatform,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

export type SocialLinkInput = {
  platform: SocialPlatform;
  url: string;
  label?: string | null;
  handle?: string | null;
  verified?: boolean;
};

@Injectable()
export class SocialLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Contact ──

  listForContact(contactId: string): Promise<ContactSocialLink[]> {
    return this.prisma.contactSocialLink.findMany({
      where: { contactId },
      orderBy: { createdAt: "asc" },
    });
  }

  upsertForContact(
    contactId: string,
    input: SocialLinkInput,
  ): Promise<ContactSocialLink> {
    return this.prisma.contactSocialLink.upsert({
      where: {
        contactId_platform_url: {
          contactId,
          platform: input.platform,
          url: input.url,
        },
      },
      create: {
        contactId,
        platform: input.platform,
        url: input.url,
        label: input.label ?? null,
        handle: input.handle ?? null,
        verified: input.verified ?? false,
      },
      update: {
        label: input.label ?? undefined,
        handle: input.handle ?? undefined,
        verified: input.verified ?? undefined,
      },
    });
  }

  upsertManyForContact(
    contactId: string,
    inputs: SocialLinkInput[],
  ): Promise<ContactSocialLink[]> {
    return Promise.all(inputs.map((i) => this.upsertForContact(contactId, i)));
  }

  removeForContact(id: string): Promise<ContactSocialLink> {
    return this.prisma.contactSocialLink.delete({ where: { id } });
  }

  // ── Company ──

  listForCompany(companyId: string): Promise<CompanySocialLink[]> {
    return this.prisma.companySocialLink.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    });
  }

  upsertForCompany(
    companyId: string,
    input: SocialLinkInput,
  ): Promise<CompanySocialLink> {
    return this.prisma.companySocialLink.upsert({
      where: {
        companyId_platform_url: {
          companyId,
          platform: input.platform,
          url: input.url,
        },
      },
      create: {
        companyId,
        platform: input.platform,
        url: input.url,
        label: input.label ?? null,
        handle: input.handle ?? null,
        verified: input.verified ?? false,
      },
      update: {
        label: input.label ?? undefined,
        handle: input.handle ?? undefined,
        verified: input.verified ?? undefined,
      },
    });
  }

  upsertManyForCompany(
    companyId: string,
    inputs: SocialLinkInput[],
  ): Promise<CompanySocialLink[]> {
    return Promise.all(inputs.map((i) => this.upsertForCompany(companyId, i)));
  }

  removeForCompany(id: string): Promise<CompanySocialLink> {
    return this.prisma.companySocialLink.delete({ where: { id } });
  }

  // Bulk read helper for joins
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static _placeholder(_p: Prisma.JsonObject): void {
    /* keep import */
  }
}
