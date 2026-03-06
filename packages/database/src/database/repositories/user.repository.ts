import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma, User, EmailStatus } from "@prisma/client";
import { ClerkUser } from "@ringee/platform";
import { DeletedUserRepository } from "./deleted.user.respository";
import { NewsletterService } from "@ringee/platform";
import { randomBytes } from "crypto";

@Injectable()
export class UserRepository {
  constructor(
    private prisma: PrismaService,
    private deletedUserRepository: DeletedUserRepository,
  ) { }

  private generateEncryptionKey(): string {
    return randomBytes(32).toString("hex");
  }

  private mapVerificationStatus(status?: string): EmailStatus {
    switch (status) {
      case "verified":
        return "verified";
      case "unverified":
        return "unverified";
      default:
        return "pending"; // fallback
    }
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        ...data,
        // freeCallTrial: false,
        encryptionKey: data.encryptionKey || this.generateEncryptionKey(),
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { emails: { some: { email } } },
      include: { emails: true },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id },
      include: { emails: true, chatAuths: true },
    });
  }

  async findByClerkId(clerkId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { clerkId },
      include: { emails: true, chatAuths: true },
    });
  }

  async findByClerkIds(clerkIds: string[]): Promise<{ id: string; clerkId: string | null }[]> {
    return this.prisma.user.findMany({
      where: { clerkId: { in: clerkIds } },
      select: { id: true, clerkId: true },
    });
  }

  private mapClerkToPrisma(clerkUser: ClerkUser): Prisma.UserCreateInput {
    return {
      clerkId: clerkUser.id,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
      profileImageUrl: clerkUser.imageUrl,
      passwordEnabled: clerkUser.passwordEnabled,
      twoFactorEnabled: clerkUser.twoFactorEnabled,
      publicMetadata: (clerkUser.publicMetadata ??
        {}) as unknown as Prisma.NullableJsonNullValueInput,
      privateMetadata: (clerkUser.privateMetadata ??
        {}) as unknown as Prisma.NullableJsonNullValueInput,
      unsafeMetadata: (clerkUser.unsafeMetadata ??
        {}) as unknown as Prisma.NullableJsonNullValueInput,
      emails: {
        create: clerkUser.emailAddresses.map((e) => ({
          email: e.emailAddress,
          isPrimary: e.id === clerkUser.primaryEmailAddressId,
          status: this.mapVerificationStatus(e.verification?.status),
        })),
      },
    };
  }

  async syncFromClerkUser(
    clerkUser: ClerkUser,
    httpRquest?: { clientIp: string; userAgent: string },
  ): Promise<User> {
    const existing = await this.findByClerkId(clerkUser.id);
    const mapped = this.mapClerkToPrisma(clerkUser);

    if (httpRquest?.clientIp && httpRquest?.userAgent) {
      mapped.clientIp = httpRquest.clientIp;
      mapped.userAgent = httpRquest.userAgent;
    }

    if (existing) {
      return this.prisma.user.update({
        where: { clerkId: clerkUser.id },
        data: {
          ...mapped,
          emails: {
            deleteMany: {},
            create: clerkUser.emailAddresses.map((e) => ({
              email: e.emailAddress,
              isPrimary: e.id === clerkUser.primaryEmailAddressId,
              status: this.mapVerificationStatus(e.verification?.status),
            })),
          },
        },
        include: { emails: true },
      });
    }

    await this.registerToNewsletter(clerkUser.emailAddresses);

    // Generate encryption key for new users
    return this.prisma.user.create({
      data: {
        ...mapped,
        // freeCallTrial: false,
        encryptionKey: this.generateEncryptionKey(),
      },
      include: { emails: true },
    });
  }

  async registerToNewsletter(emailAddresses: any) {
    if (!emailAddresses || emailAddresses.length === 0) return;

    const verifiedEmails = emailAddresses.filter(
      (it: any) => it.verification?.status === "verified",
    );
    const mapped = verifiedEmails.map((it: any) => it.emailAddress);

    await Promise.allSettled(mapped.map(NewsletterService.register));
  }

  async updateFromClerkUser(
    clerkUser: ClerkUser,
    httpRquest?: { clientIp: string; userAgent: string },
  ): Promise<User> {
    const mapped = this.mapClerkToPrisma(clerkUser);

    if (httpRquest?.clientIp && httpRquest?.userAgent) {
      mapped.clientIp = httpRquest.clientIp;
      mapped.userAgent = httpRquest.userAgent;
    }

    await this.registerToNewsletter(clerkUser.emailAddresses);

    return this.prisma.user.update({
      where: { clerkId: clerkUser.id },
      data: {
        ...mapped,
        updatedAt: new Date(),
        emails: {
          deleteMany: {},
          create: clerkUser.emailAddresses.map((e) => ({
            email: e.emailAddress,
            isPrimary: e.id === clerkUser.primaryEmailAddressId,
            status: this.mapVerificationStatus(e.verification?.status),
          })),
        },
      },
      include: { emails: true },
    });
  }

  async deleteByClerkId(clerkId: string): Promise<void> {
    const user = await this.findByClerkId(clerkId);

    if (!user) {
      throw new Error("User not found");
    }

    await this.deletedUserRepository.archiveUser(user);

    await this.prisma.user.delete({
      where: { clerkId },
    });
  }

  async bulkSync(users: ClerkUser[]): Promise<User[]> {
    const results: User[] = [];
    for (const clerkUser of users) {
      const synced = await this.syncFromClerkUser(clerkUser);
      results.push(synced);
    }
    return results;
  }

  async update(id: string, input: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: input,
    });
  }

  async updateFreeCallTrial(id: string, freeCallTrial: boolean): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { freeCallTrial },
    });
  }

  // ─── Onboarding Methods ────────────────────────────────────────────────────

  async getOnboardingStatus(id: string): Promise<{
    completedSteps: string[];
    dismissedAt: Date | null;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        onboardingCompletedSteps: true,
        onboardingDismissedAt: true,
      },
    });

    if (!user) return null;

    return {
      completedSteps: user.onboardingCompletedSteps,
      dismissedAt: user.onboardingDismissedAt,
    };
  }

  async completeOnboardingStep(id: string, step: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { onboardingCompletedSteps: true },
    });

    const currentSteps = user?.onboardingCompletedSteps || [];

    // Avoid duplicates
    if (currentSteps.includes(step)) {
      return this.prisma.user.findUnique({ where: { id } }) as Promise<User>;
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        onboardingCompletedSteps: [...currentSteps, step],
      },
    });
  }

  async dismissOnboarding(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        onboardingDismissedAt: new Date(),
      },
    });
  }

  async undismissOnboarding(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        onboardingDismissedAt: null,
      },
    });
  }
}
