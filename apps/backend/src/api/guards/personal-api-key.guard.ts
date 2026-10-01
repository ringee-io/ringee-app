import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  PersonalApiKeyService,
  type ResolvedPersonalApiKey,
} from "@ringee/services";
import type { Request } from "express";

const API_KEY_HEADER = "x-ringee-api-key";
const BEARER_PREFIX = "bearer ";

export interface PersonalApiKeyRequest extends Request {
  personalApiKeyAuth: ResolvedPersonalApiKey;
}

/**
 * Authenticates the agent surfaces (MCP endpoint, CLI helpers) with a personal
 * API key, sent as `Authorization: Bearer ringee_sk_…` (or `X-Ringee-Api-Key`).
 * The ownership context comes from the stored key and the user's active
 * workspace — never from anything else the client sends.
 */
@Injectable()
export class PersonalApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: PersonalApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PersonalApiKeyRequest>();
    const rawKey = this.readApiKey(request);
    if (!rawKey) {
      context
        .switchToHttp()
        .getResponse()
        .setHeader("WWW-Authenticate", 'Bearer realm="Ringee"');
      throw new UnauthorizedException(
        "Missing API key. Send it as `Authorization: Bearer <key>`.",
      );
    }

    request.personalApiKeyAuth = await this.apiKeys.authenticate(rawKey);
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

    const value = authorization.trim();
    if (
      value.length <= BEARER_PREFIX.length ||
      value.slice(0, BEARER_PREFIX.length).toLowerCase() !== BEARER_PREFIX
    ) {
      return undefined;
    }
    return value.slice(BEARER_PREFIX.length).trim() || undefined;
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
