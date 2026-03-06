import { Controller, Get, NotFoundException } from "@nestjs/common";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { UserRepository, OrganizationRepository } from "@ringee/database";

interface CurrentUserData {
    id: string;
    activeOrgId?: string | null;
}

@Controller("encryption")
export class EncryptionController {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly organizationRepository: OrganizationRepository,
    ) { }

    /**
     * Get the encryption key for the current user or their active organization.
     * If the user has an active organization, return the organization's key.
     * Otherwise, return the user's personal key.
     */
    @Get("key")
    async getEncryptionKey(
        @CurrentUser() currentUser: CurrentUserData,
    ): Promise<{ key: string }> {
        const ctx = createOwnershipContext(currentUser);

        // If user has an active organization, use the organization's key
        if (ctx.organizationId) {
            const org = await this.organizationRepository.findById(ctx.organizationId);
            if (!org) {
                throw new NotFoundException("Organization not found");
            }
            if (!org.encryptionKey) {
                throw new NotFoundException("Organization encryption key not found");
            }
            return { key: org.encryptionKey };
        }

        // Otherwise, use the user's personal key
        const user = await this.userRepository.findById(ctx.userId);
        if (!user) {
            throw new NotFoundException("User not found");
        }
        if (!user.encryptionKey) {
            throw new NotFoundException("User encryption key not found");
        }
        return { key: user.encryptionKey };
    }
}
