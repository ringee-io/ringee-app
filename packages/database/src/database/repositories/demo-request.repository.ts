import { Injectable } from "@nestjs/common";
import { DemoRequest, Prisma } from "@prisma/client";
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

/**
 * Every move of a request's review is a compare-and-set on the state it moves
 * from, so the review workflow's retries and the team acting by hand cannot
 * overwrite each other (LIFE-004). Each returns whether this call made it.
 */
@Injectable()
export class DemoRequestRepository {
  constructor(private prisma: PrismaService) {}

  create(data: CreateDemoRequestData): Promise<DemoRequest> {
    return this.prisma.demoRequest.create({ data });
  }

  findById(id: string): Promise<DemoRequest | null> {
    return this.prisma.demoRequest.findUnique({ where: { id } });
  }

  /** Most recent request from this email since `since`, used to rate-limit. */
  findRecentByEmail(email: string, since: Date): Promise<DemoRequest | null> {
    return this.prisma.demoRequest.findFirst({
      where: { email, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** The newest request from this email that has no login yet. */
  findLatestWithoutAccount(email: string): Promise<DemoRequest | null> {
    return this.prisma.demoRequest.findFirst({
      where: { email, clerkUserId: null },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Store the review's verdict, only while the request still waits on it. */
  async recordReview(
    id: string,
    status: "approved" | "needs_info",
    review: Prisma.InputJsonValue,
  ): Promise<boolean> {
    const { count } = await this.prisma.demoRequest.updateMany({
      where: { id, status: "received" },
      data: { status, review, reviewedAt: new Date() },
    });
    return count === 1;
  }

  /** The login created for this request. Recorded once. */
  async recordAccount(id: string, clerkUserId: string): Promise<boolean> {
    const { count } = await this.prisma.demoRequest.updateMany({
      where: { id, clerkUserId: null },
      data: {
        status: "account_created",
        clerkUserId,
        accountCreatedAt: new Date(),
      },
    });
    return count === 1;
  }

  /**
   * The team created this person's login by hand. `notified` says whether the
   * credentials email went out with it.
   */
  async recordManualAccount(
    id: string,
    clerkUserId: string,
    notified: boolean,
  ): Promise<boolean> {
    const now = new Date();
    const { count } = await this.prisma.demoRequest.updateMany({
      where: { id, clerkUserId: null },
      data: {
        status: "account_created",
        clerkUserId,
        accountCreatedAt: now,
        statusReason: null,
        ...(notified ? { notifiedAt: now } : {}),
      },
    });
    return count === 1;
  }

  /** The outcome email was accepted — it is never sent again. */
  async markNotified(id: string): Promise<boolean> {
    const { count } = await this.prisma.demoRequest.updateMany({
      where: { id, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
    return count === 1;
  }

  /**
   * Hand the request to the team. A request whose outcome email already went
   * out is finished and stays as it is; one already handed over is not handed
   * over twice.
   */
  async markManualReview(id: string, reason: string): Promise<boolean> {
    const { count } = await this.prisma.demoRequest.updateMany({
      where: { id, notifiedAt: null, status: { not: "manual_review" } },
      data: { status: "manual_review", statusReason: reason },
    });
    return count === 1;
  }
}
