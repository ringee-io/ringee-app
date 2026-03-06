import { clerkClient } from "@clerk/express";
import { EmailStatus, User as PrismaUser, UserEmail } from "@ringee/database";
import { User as ClerkUser } from "@clerk/express";

export class ClerkUserRepository {
  static async findById(id: string) {
    return clerkClient.users.getUser(id);
  }

  static async updateMetadata(
    clerkUserId: string,
    metadata: {
      publicMetadata?: Record<string, any>;
      privateMetadata?: Record<string, any>;
      unsafeMetadata?: Record<string, any>;
    }
  ) {
    return clerkClient.users.updateUser(clerkUserId, metadata);
  }

  static async findByIds(ids: string[]) {
    const promises = ids.map((id) => clerkClient.users.getUser(id));
    const users = await Promise.all(promises);

    return users.map((user) => ({
      id: user.privateMetadata.id,
      clerkId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    }));
  }

  static mapVerificationStatus(status?: string): EmailStatus {
    switch (status) {
      case "verified":
        return "verified";
      case "unverified":
        return "unverified";
      default:
        return "pending";
    }
  }

  static mapToUser(user: ClerkUser): PrismaUser & { emails: UserEmail[] } {
    return {
      id: user.id,
      clerkId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      profileImageUrl: user.imageUrl,
      passwordEnabled: user.passwordEnabled,
      twoFactorEnabled: user.twoFactorEnabled,

      publicMetadata: user.publicMetadata as unknown as object,
      privateMetadata: user.privateMetadata as unknown as object,
      unsafeMetadata: user.unsafeMetadata as unknown as object,

      createdAt: new Date(user.createdAt ?? Date.now()),
      updatedAt: new Date(user.updatedAt ?? Date.now()),
      clientIp: null,
      userAgent: null,
      customerId: null,
      freeCallTrial: false,
      encryptionKey: null,
      onboardingCompletedSteps: [],
      onboardingDismissedAt: null,
      emails: user.emailAddresses.map((e) => ({
        id: e.id,
        userId: user.id,
        email: e.emailAddress,
        isPrimary: e.id === user.primaryEmailAddressId,
        status: this.mapVerificationStatus(e.verification?.status),
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };
  }
}
