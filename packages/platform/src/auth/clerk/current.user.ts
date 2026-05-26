import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ClerkUserRepository } from "./clerk.user.repository";

export const CurrentUser = createParamDecorator(
  async (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    const clerkUserId = request.clerkUserId;
    const clerkOrgId = request.clerkOrgId;
    const activeOrgRole = request.orgRole;

    if (!clerkUserId) {
      throw new UnauthorizedException("No authenticated user in request");
    }

    let user;
    try {
      user = await ClerkUserRepository.findById(clerkUserId);
    } catch (error) {
      console.error("Error al obtener usuario:", error);
      throw new InternalServerErrorException(
        "Failed to resolve user from Clerk",
      );
    }

    if (!user) {
      throw new UnauthorizedException("Clerk user not found");
    }

    const mappedUser = ClerkUserRepository.mapToUser(user);
    const rawUserId = (user.privateMetadata as any)?.userId;

    if (!rawUserId) {
      throw new UnauthorizedException(
        "Clerk user is missing privateMetadata.userId",
      );
    }

    return {
      ...mappedUser,
      id: rawUserId,
      activeOrgId: clerkOrgId ?? null,
      activeOrgRole,
    };
  },
);
