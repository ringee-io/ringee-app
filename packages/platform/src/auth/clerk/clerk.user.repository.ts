import { clerkClient } from "@clerk/express";
import { EmailStatus, User as PrismaUser, UserEmail } from "@ringee/database";
import { User as ClerkUser } from "@clerk/express";

/** Why Clerk refused to create a login. */
export type ClerkUserCreationFailure =
  | "email_taken"
  | "invalid_email"
  | "password_rejected"
  | "unknown";

export class ClerkUserCreationError extends Error {
  constructor(
    readonly reason: ClerkUserCreationFailure,
    message: string,
  ) {
    super(message);
    this.name = "ClerkUserCreationError";
  }
}

export interface NewClerkUser {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  /** Server-only notes on the login; never readable from the browser. */
  privateMetadata?: Record<string, unknown>;
}

/** A login found by its email address. */
export interface ClerkLogin {
  id: string;
  privateMetadata: Record<string, unknown>;
}

export class ClerkUserRepository {
  static async findById(id: string) {
    return clerkClient.users.getUser(id);
  }

  /**
   * A login Ringee creates for someone (LIFE-005). Clerk marks an email added
   * through its backend API as verified, so the person can sign in at once.
   */
  static async createUser(input: NewClerkUser): Promise<{ id: string }> {
    try {
      const user = await clerkClient.users.createUser({
        emailAddress: [input.email],
        firstName: input.firstName,
        lastName: input.lastName,
        password: input.password,
        privateMetadata: input.privateMetadata,
      });
      return { id: user.id };
    } catch (error) {
      throw toCreationError(error);
    }
  }

  /** The login that owns this email address, if there is one. */
  static async findByEmail(email: string): Promise<ClerkLogin | null> {
    const { data } = await clerkClient.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });
    const user = data[0];
    if (!user) return null;
    return {
      id: user.id,
      privateMetadata: (user.privateMetadata ?? {}) as Record<string, unknown>,
    };
  }

  /** Replace a login's password and sign it out everywhere else. */
  static async setPassword(
    clerkUserId: string,
    password: string,
  ): Promise<void> {
    await clerkClient.users.updateUser(clerkUserId, {
      password,
      signOutOfOtherSessions: true,
    });
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

/**
 * Clerk answers a refused create with a list of coded errors. Read the codes
 * by shape, so nothing outside this adapter has to know Clerk's error class.
 */
function toCreationError(error: unknown): ClerkUserCreationError {
  const failures =
    (
      error as {
        errors?: Array<{
          code?: string;
          message?: string;
          longMessage?: string;
          meta?: { paramName?: string };
        }>;
      }
    )?.errors ?? [];
  const first = failures[0];
  const message =
    first?.longMessage ||
    first?.message ||
    (error instanceof Error ? error.message : String(error));

  const codes = failures.map((failure) => failure.code ?? "");
  if (codes.includes("form_identifier_exists")) {
    return new ClerkUserCreationError("email_taken", message);
  }
  if (codes.some((code) => code.startsWith("form_password"))) {
    return new ClerkUserCreationError("password_rejected", message);
  }
  if (
    failures.some(
      (failure) =>
        failure.code === "form_param_format_invalid" &&
        failure.meta?.paramName === "email_address",
    )
  ) {
    return new ClerkUserCreationError("invalid_email", message);
  }
  return new ClerkUserCreationError("unknown", message);
}
