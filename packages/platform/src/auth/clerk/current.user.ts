import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { ClerkUserRepository } from "./clerk.user.repository";

export const CurrentUser = createParamDecorator(
  async (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    const clerkUserId = request.clerkUserId;
    const clerkOrgId = request.clerkOrgId;
    const activeOrgRole = request.orgRole;

    if (!clerkUserId) return null;

    try {
      const user = await ClerkUserRepository.findById(clerkUserId);

      if (!user) return null;

      const mappedUser = ClerkUserRepository.mapToUser(user);
      const rawUserId = (user.privateMetadata as any)?.userId;

      let activeOrgId = null;

      if (clerkOrgId) {
        activeOrgId = clerkOrgId;
      }

      return {
        ...mappedUser,
        id: rawUserId,
        activeOrgId,
        activeOrgRole,
      };
    } catch (error) {
      console.error("Error al obtener usuario:", error);
      return null;
    }
  },
);
