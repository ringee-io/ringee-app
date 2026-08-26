import { Controller, Get } from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { EncryptionKeyService } from "@ringee/services";

@Controller("encryption")
export class EncryptionController {
  constructor(private readonly encryptionKeys: EncryptionKeyService) {}

  /**
   * The encryption key for the caller's workspace — the organization's when one
   * is active, otherwise the user's own.
   */
  @Get("key")
  async getEncryptionKey(
    @CurrentUser() currentUser: CurrentUserData,
  ): Promise<{ key: string }> {
    return {
      key: await this.encryptionKeys.getWorkspaceKey(
        createOwnershipContext(currentUser),
      ),
    };
  }
}
