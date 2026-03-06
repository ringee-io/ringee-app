import { clerkClient } from "@clerk/express";
import { Organization as ClerkOrganization } from "@clerk/express";

export class ClerkOrganizationRepository {
    static async findById(id: string): Promise<ClerkOrganization> {
        return clerkClient.organizations.getOrganization({
            organizationId: id,
        });
    }

    static async getMembers(organizationId: string): Promise<any> {
        return clerkClient.organizations.getOrganizationMembershipList({
            organizationId,
        });
    }
}

export type { ClerkOrganization };
