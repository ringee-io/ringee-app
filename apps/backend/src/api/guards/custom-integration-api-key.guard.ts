import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  CustomIntegrationAuthService,
  type ResolvedApiKey,
} from "@ringee/services";
import type { Request } from "express";

const API_KEY_HEADER = "x-ringee-api-key";

export interface CustomIntegrationApiRequest extends Request {
  customIntegrationAuth: ResolvedApiKey;
}

/**
 * Authenticates the server-to-server public API with the secret issued for a
 * Custom Integration. The resolved ownership context comes only from the
 * stored integration; no workspace identity supplied by the client is used.
 */
@Injectable()
export class CustomIntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly auth: CustomIntegrationAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<CustomIntegrationApiRequest>();
    const apiKey = this.readApiKey(request);

    request.customIntegrationAuth = await this.auth.resolveApiKey(apiKey);
    return true;
  }

  private readApiKey(request: Request): string | undefined {
    const customHeader = this.singleHeader(request.headers[API_KEY_HEADER]);
    const authorization = this.singleHeader(request.headers.authorization);

    if (customHeader && authorization) {
      throw new UnauthorizedException(
        "Send the API key in either X-Ringee-Api-Key or Authorization, not both",
      );
    }
    if (customHeader) return customHeader;
    if (!authorization) return undefined;

    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    return match?.[1]?.trim();
  }

  private singleHeader(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      throw new UnauthorizedException(
        "Multiple API key headers are not allowed",
      );
    }
    return value?.trim() || undefined;
  }
}
