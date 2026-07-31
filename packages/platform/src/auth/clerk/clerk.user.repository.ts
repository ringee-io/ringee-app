import { clerkClient } from "@clerk/express";
import { EmailStatus, User as PrismaUser, UserEmail } from "@ringee/database";
import { User as ClerkUser } from "@clerk/express";

export class ClerkUserRepository {
  static async findById(id: string) {
    return clerkClient.users.getUser(id);
  }

  /**
   * Native Clerk ban. Clerk revokes the user's active sessions and prevents
   * future sign-ins until an administrator unbans the account.
   */
  static async banUser(clerkUserId: string): Promise<void> {
    await clerkClient.users.banUser(clerkUserId);
  }

  /** Restore sign-in access for a Clerk user previously banned by Ringee. */
  static async unbanUser(clerkUserId: string): Promise<void> {
    await clerkClient.users.unbanUser(clerkUserId);
  }

  static async updateMetadata(
    clerkUserId: string,
    metadata: {
      publicMetadata?: Record<string, unknown>;
      privateMetadata?: Record<string, unknown>;
      unsafeMetadata?: Record<string, unknown>;
    },
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
    const primaryPhone =
      user.phoneNumbers.find(
        (phone) => phone.id === user.primaryPhoneNumberId,
      ) ?? user.phoneNumbers[0];

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
      canCall: true,
      minimumCreditPurchase: 5,
      numberPurchaseLimit: null,
      blockedAt: null,
      blockedReason: null,
      phoneNumber: primaryPhone?.phoneNumber ?? null,
      phoneVerified: primaryPhone?.verification?.status === "verified",
      phoneRequired: true,
      encryptionKey: null,
      onboardingCompletedSteps: [],
      onboardingDismissedAt: null,
      notificationPreferences: null,
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
