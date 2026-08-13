import { Injectable } from "@nestjs/common";
import { DemoRequest } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface CreateDemoRequestData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  companyWebsite: string;
  numberOfUsers: string;
  referralSource: string;
  country?: string | null;
}

@Injectable()
export class DemoRequestRepository {
  constructor(private prisma: PrismaService) {}

  create(data: CreateDemoRequestData): Promise<DemoRequest> {
    return this.prisma.demoRequest.create({ data });
  }

  /** Most recent request from this email since `since`, used to rate-limit. */
  findRecentByEmail(email: string, since: Date): Promise<DemoRequest | null> {
    return this.prisma.demoRequest.findFirst({
      where: { email, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
  }
}
