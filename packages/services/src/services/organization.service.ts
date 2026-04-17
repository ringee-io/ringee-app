import { Injectable } from "@nestjs/common";
import { Organization, OrganizationRepository } from "@ringee/database";
import { RedisService } from "@ringee/platform";

@Injectable()
export class OrganizationService {
    constructor(
        private readonly organizationRepository: OrganizationRepository,
        private readonly redisService: RedisService,
    ) { }

    async getOrganizationById(id: string): Promise<Organization | null> {
        return this.organizationRepository.findById(id);
    }

    async getByClerkId(clerkId: string): Promise<Organization | null> {
        const cachedOrg = await this.redisService.get<Organization>(`organization:${clerkId}`);

        if (cachedOrg) {
            return cachedOrg;
        }

        const org = await this.organizationRepository.findByClerkId(clerkId);

        if (org) {
            await this.redisService.set(`organization:${clerkId}`, org);
        }

        return org;
    }
    async updateCustomerId(id: string, customerId: string): Promise<Organization> {
        return this.organizationRepository.updateCustomerId(id, customerId);
    }
}
