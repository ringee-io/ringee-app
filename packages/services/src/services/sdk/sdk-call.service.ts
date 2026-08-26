import { Injectable, Logger } from "@nestjs/common";
import { CallRepository, CallStatus } from "@ringee/database";
import { RedisService, signCallCorrelation } from "@ringee/platform";
import { ComplianceService } from "../outbound/compliance.service";
import { ConcurrentCallGuardService } from "../security";
import { CreditService } from "../credit.service";
import { SdkCallerIdResolver } from "./sdk-caller-id-resolver.service";
import { SdkContactResolver } from "./sdk-contact-resolver.service";
import { SdkAuthenticatedAgent } from "./sdk-session.service";
import { SdkError } from "./sdk.errors";

export interface SdkAuthorizeInput {
  to: string;
  callerIdId?: string;
  contactId?: string;
  externalContactId?: string;
  allowOverCap?: boolean;
  idempotencyKey?: string;
}

export interface SdkAuthorizeResult {
  callId: string;
  destinationNumber: string;
  callerIdNumber: string;
  /** Signed value the SDK echoes in the `X-Ringee-Call-Id` SIP header. */
  correlationToken: string;
  /** Base64 client_state the WebRTC leg attaches (matches the web dialer). */
  clientState: string;
}

const IDEMPOTENCY_TTL_SECONDS = 600;

/**
 * Authorizes an SDK call and pre-creates the `Call` row (`source = "sdk"`).
 *
 * This is a DELIBERATELY THIN layer over the exact services the web dialer and
 * extension already use — DNC, credit, caller-ID resolution/rotation, contact
 * resolution. It does NOT re-implement any of that, nor does it touch Telnyx:
 * the browser places the WebRTC leg with a signed correlation token, and the
 * existing Telnyx webhook adopts this row and drives every downstream effect
 * (status, cost, recording, CRM webhooks) unchanged.
 */
@Injectable()
export class SdkCallService {
  private readonly logger = new Logger(SdkCallService.name);

  constructor(
    private readonly compliance: ComplianceService,
    private readonly credit: CreditService,
    private readonly callerIds: SdkCallerIdResolver,
    private readonly contacts: SdkContactResolver,
    private readonly calls: CallRepository,
    private readonly redis: RedisService,
    private readonly concurrentCalls: ConcurrentCallGuardService,
  ) {}

  async authorize(
    agent: SdkAuthenticatedAgent,
    input: SdkAuthorizeInput,
  ): Promise<SdkAuthorizeResult> {
    const to = (input.to ?? "").trim();
    if (!SdkCallerIdResolver.isE164(to)) {
      throw new SdkError(
        "INVALID_PHONE_NUMBER",
        "A valid E.164 destination is required.",
      );
    }

    const ctx = agent.ctx;

    // Idempotency: a retried authorize with the same key returns the same call.
    const idemKey = input.idempotencyKey
      ? `ringee:sdk:idem:${agent.integration.id}:${input.idempotencyKey}`
      : null;
    if (idemKey) {
      const cached = await this.redis
        .get<SdkAuthorizeResult>(idemKey)
        .catch(() => undefined);
      if (cached) return cached;
    }

    // One call at a time per user, across every device — the same rule the web
    // dialer, the extension and desk phones enforce. Each SDK session counts as
    // its own device, so an agent embedded in two CRMs cannot dial from both.
    const decision = await this.concurrentCalls.requestDial(agent.user.id, {
      // Identity = which integration on which host page. Two tabs of the same
      // CRM are one device; a second CRM (or the web dialer) is a second one.
      deviceId: `sdk:${agent.claims.integrationId}:${agent.claims.origin}`,
      deviceLabel: agent.integration.name,
      source: "sdk",
    });
    if (!decision.allowed) {
      throw new SdkError("CALL_ALREADY_ACTIVE", decision.message);
    }

    // The slot is reserved from here on. Every refusal below — DNC, no
    // credit, no caller ID — has to hand it back, or an authorize that never
    // became a call keeps the agent busy for the lease's TTL.
    try {
      // DNC — blocking.
      const dnc = await this.compliance.findOnDNC(ctx, to).catch(() => null);
      if (dnc) {
        throw new SdkError(
          "DNC_BLOCKED",
          dnc.reason ?? "This number is on the Do-Not-Call list.",
        );
      }

      // Credit — blocking.
      const balance = await this.credit.getBalance(ctx).catch(() => 0);
      if (balance <= 0) {
        throw new SdkError(
          "INSUFFICIENT_CREDIT",
          "Not enough credits to place this call.",
        );
      }

      // Caller ID (explicit pick or rotation-aware fixed number).
      const callerId = await this.callerIds.resolveForDial(
        ctx,
        agent.user.id,
        to,
        {
          callerIdId: input.callerIdId,
          allowOverCap: input.allowOverCap,
        },
      );

      // Contact (never auto-created).
      const contactId = await this.contacts.resolve(ctx, agent.integration.id, {
        contactId: input.contactId,
        externalContactId: input.externalContactId,
      });

      // Pre-create the Call row; the webhook adopts it via the correlation token.
      const call = await this.calls.createCall(ctx, {
        fromNumber: callerId.phoneNumber,
        toNumber: to,
        direction: "outbound",
        status: CallStatus.pending,
        source: "sdk",
        clientState: Buffer.from("initiate_call").toString("base64"),
        contact: contactId ? { connect: { id: contactId } } : undefined,
        callerId: callerId.callerIdId
          ? { connect: { id: callerId.callerIdId } }
          : undefined,
      });

      const result: SdkAuthorizeResult = {
        callId: call.id,
        destinationNumber: to,
        callerIdNumber: callerId.phoneNumber,
        correlationToken: signCallCorrelation(call.id),
        clientState: call.clientState ?? "",
      };

      if (idemKey) {
        await this.redis
          .set(idemKey, result, IDEMPOTENCY_TTL_SECONDS * 1000)
          .catch(() => undefined);
      }

      this.logger.log(
        `SDK call authorized: ${call.id} (integration=${agent.integration.id})`,
      );
      return result;
    } catch (error) {
      await this.concurrentCalls.releasePending(
        agent.user.id,
        `sdk:${agent.claims.integrationId}:${agent.claims.origin}`,
      );
      throw error;
    }
  }
}
