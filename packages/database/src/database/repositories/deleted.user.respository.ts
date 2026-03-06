import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { DeletedUser } from "@prisma/client";
import { User } from "@prisma/client";

@Injectable()
export class DeletedUserRepository {
  constructor(private prisma: PrismaService) {}

  async archiveUser(
    user: User & { emails?: any[]; chatAuths?: any[] },
    reason?: string,
    deletedBy?: string,
  ): Promise<DeletedUser> {
    return this.prisma.deletedUser.create({
      data: {
        originalUserId: user.id,
        clerkId: user.clerkId,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        profileImageUrl: user.profileImageUrl,
        passwordEnabled: user.passwordEnabled,
        twoFactorEnabled: user.twoFactorEnabled,
        publicMetadata: user.publicMetadata as unknown as {},
        privateMetadata: user.privateMetadata as unknown as {},
        unsafeMetadata: user.unsafeMetadata as unknown as {},
        clientIp: user.clientIp,
        userAgent: user.userAgent,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        deletionReason: reason,
        deletedBy,
        deletedAt: new Date(),
        emails: user.emails ? user.emails : [],
        chatAuths: user.chatAuths ? user.chatAuths : [],
      },
    });
  }
}
