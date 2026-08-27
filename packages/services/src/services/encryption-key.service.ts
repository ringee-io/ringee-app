import { Injectable, NotFoundException } from "@nestjs/common";
import { OrganizationRepository, UserRepository } from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

/**
 * Resolves the encryption key of the caller's workspace.
 *
 * The key is per workspace, not per user: an organization's calls and
 * recordings are encrypted with the organization's key, a freelancer's with
 * their own. `RecordingProcessingService.getEncryptionKey` applies the same
 * rule server-side — this service is the read path the dashboard uses to
 * decrypt what it plays back.
 */
@Injectable()
export class EncryptionKeyService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async getWorkspaceKey(ctx: OwnershipContext): Promise<string> {
    if (ctx.organizationId) {
      const org = await this.organizationRepository.findById(
        ctx.organizationId,
      );
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      if (!org.encryptionKey) {
        throw new NotFoundException("Organization encryption key not found");
      }
      return org.encryptionKey;
    }

    const user = await this.userRepository.findById(ctx.userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    if (!user.encryptionKey) {
      throw new NotFoundException("User encryption key not found");
    }
    return user.encryptionKey;
  }
}
