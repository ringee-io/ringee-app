import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { ClerkUserRepository } from "@ringee/platform";

/**
 * AI Voice Agents ship to production behind a closed beta.
 *
 * The module is deployed and exercised against real numbers and real credits,
 * so until it is opened up only the people on this allowlist may reach it. The
 * sidebar entry and the dashboard route ask the API for the same answer
 * (see AiVoiceAgentAccessController), so the UI gate and this guard cannot
 * drift apart.
 *
 * Unlike the backoffice allowlist there IS a committed default: this gate hides
 * a product feature rather than granting privilege, so a self-hosted deployment
 * that never sets the variable must not be handed super-user power — it is
 * simply told the beta is closed, and opens it with the variable below.
 *
 * `AI_VOICE_AGENTS_BETA_EMAILS` overrides the list. Setting it to an empty
 * string lifts the gate entirely and hands the module back to every workspace,
 * which is how this beta ends — delete the guard afterwards.
 */
const DEFAULT_VOICE_AGENT_BETA_EMAILS = [
  "edison.padilla@coderio.com",
  "edisonpadilla.dev@gmail.com",
  "publica.do.oficial@gmail.com",
];

export function getVoiceAgentBetaEmails(): string[] {
  const raw = apiConfiguration.AI_VOICE_AGENTS_BETA_EMAILS;
  if (raw === undefined) return DEFAULT_VOICE_AGENT_BETA_EMAILS;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether a Clerk user may use the AI Voice Agents module.
 *
 * Only verified addresses are trusted, so an unverified alias cannot claim a
 * seat in the beta. An empty allowlist means the gate has been lifted.
 */
export async function resolveVoiceAgentBetaAccess(
  clerkUserId: string,
): Promise<boolean> {
  const allowlist = getVoiceAgentBetaEmails();
  if (allowlist.length === 0) return true;

  try {
    const clerkUser = await ClerkUserRepository.findById(clerkUserId);
    return clerkUser.emailAddresses
      .filter((e) => e.verification?.status === "verified")
      .map((e) => e.emailAddress.toLowerCase())
      .some((email) => allowlist.includes(email));
  } catch {
    // Fail closed: an unreachable Clerk must not open a paid beta module.
    return false;
  }
}

/**
 * Route guard for the AI Voice Agents dashboard API. Runs after the global
 * `ClerkAuthGuard` (which populates `request.clerkUserId`). The provider-facing
 * webhook and tool controllers live on their own paths and are deliberately not
 * covered — an in-flight call must keep working regardless of who owns it.
 */
@Injectable()
export class VoiceAgentBetaGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clerkUserId: string | undefined = request.clerkUserId;

    if (!clerkUserId) {
      throw new UnauthorizedException("No authenticated user in request");
    }

    if (!(await resolveVoiceAgentBetaAccess(clerkUserId))) {
      throw new ForbiddenException("AI Voice Agents is in a closed beta");
    }

    return true;
  }
}
