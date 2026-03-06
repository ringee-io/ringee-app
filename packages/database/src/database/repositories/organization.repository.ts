import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma, Organization } from "@prisma/client";
import { ClerkOrganization } from "@ringee/platform";
import { randomBytes } from "crypto";

@Injectable()
export class OrganizationRepository {
    constructor(private prisma: PrismaService) { }

    private generateEncryptionKey(): string {
        return randomBytes(32).toString("hex");
    }

    async findByClerkId(clerkId: string): Promise<Organization | null> {
        return this.prisma.organization.findFirst({
            where: { clerkId },
            include: { members: true },
        });
    }

    async findById(id: string): Promise<Organization | null> {
        return this.prisma.organization.findFirst({
            where: { id },
            include: { members: true },
        });
    }

    private mapClerkToPrisma(
        clerkOrg: ClerkOrganization,
    ): Prisma.OrganizationCreateInput {
        return {
            clerkId: clerkOrg.id,
            name: clerkOrg.name,
            slug: clerkOrg.slug ?? null,
            imageUrl: clerkOrg.imageUrl ?? null,
            createdBy: clerkOrg.createdBy ?? null,
        };
    }

    async syncFromClerkOrganization(
        clerkOrg: ClerkOrganization,
    ): Promise<Organization> {
        const existing = await this.findByClerkId(clerkOrg.id);
        const mapped = this.mapClerkToPrisma(clerkOrg);

        if (existing) {
            // Update existing organization (don't regenerate key)
            return this.prisma.organization.update({
                where: { clerkId: clerkOrg.id },
                data: {
                    ...mapped,
                    updatedAt: new Date(),
                },
                include: { members: true },
            });
        }

        // Create new organization with encryption key
        return this.prisma.organization.create({
            data: {
                ...mapped,
                encryptionKey: this.generateEncryptionKey(),
            },
            include: { members: true },
        });
    }

    async updateFromClerkOrganization(
        clerkOrg: ClerkOrganization,
    ): Promise<Organization> {
        const mapped = this.mapClerkToPrisma(clerkOrg);

        return this.prisma.organization.update({
            where: { clerkId: clerkOrg.id },
            data: {
                ...mapped,
                updatedAt: new Date(),
            },
            include: { members: true },
        });
    }

    async deleteByClerkId(clerkId: string): Promise<void> {
        const org = await this.findByClerkId(clerkId);

        if (!org) {
            throw new Error("Organization not found");
        }

        await this.prisma.organization.delete({
            where: { clerkId },
        });
    }

    async addMembership(
        organizationClerkId: string,
        userClerkId: string,
        role: string,
    ): Promise<void> {
        const org = await this.prisma.organization.findUnique({
            where: { clerkId: organizationClerkId },
        });

        if (!org) {
            throw new Error("Organization not found");
        }

        const user = await this.prisma.user.findUnique({
            where: { clerkId: userClerkId },
        });

        // Si el usuario existe, crear membresía con userId
        // Si no existe (invitación pendiente), crear con clerkUserId solamente
        await this.prisma.organizationMembership.upsert({
            where: {
                organizationId_clerkUserId: {
                    organizationId: org.id,
                    clerkUserId: userClerkId,
                },
            },
            create: {
                organizationId: org.id,
                userId: user?.id,
                clerkUserId: userClerkId,
                role,
            },
            update: {
                userId: user?.id, // Actualizar userId si el usuario ahora existe
                role,
                updatedAt: new Date(),
            },
        });
    }

    async removeMembership(
        organizationClerkId: string,
        userClerkId: string,
    ): Promise<void> {
        const org = await this.prisma.organization.findUnique({
            where: { clerkId: organizationClerkId },
        });

        const user = await this.prisma.user.findUnique({
            where: { clerkId: userClerkId },
        });

        if (!org || !user) {
            return;
        }

        await this.prisma.organizationMembership.deleteMany({
            where: {
                organizationId: org.id,
                userId: user.id,
            },
        });
    }
    async updateCustomerId(id: string, customerId: string): Promise<Organization> {
        return this.prisma.organization.update({
            where: { id },
            data: { customerId },
            include: { members: true },
        });
    }
}
