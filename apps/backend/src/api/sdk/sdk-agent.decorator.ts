import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { SdkAuthenticatedAgent } from "@ringee/services";

/**
 * Injects the authenticated SDK agent that {@link SdkSessionGuard} attached to
 * the request. Only valid on routes protected by that guard.
 */
export const SdkAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SdkAuthenticatedAgent => {
    const req = ctx.switchToHttp().getRequest();
    return req.sdkAgent as SdkAuthenticatedAgent;
  },
);

/** Reads the `Origin` header (used for pk/session origin binding). */
export const RequestOrigin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.headers?.origin as string | undefined;
  },
);
