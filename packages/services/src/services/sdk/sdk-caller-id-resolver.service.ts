import { Injectable } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { OwnershipContext } from "@ringee/platform";
import { PrismaService } from "@ringee/database";
import { NumberPurchasedService } from "../number.purchased.service";
import { CallerIdService } from "../caller.id.service";
import { CallerIdRotationService } from "../caller-id-rotation/caller-id-rotation.service";
import { SdkError } from "./sdk.errors";

export interface SdkCallerId {
  id: string;
  phoneNumber: string;
  isPrimary: boolean;
  canRecord: boolean;
}

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Resolves which numbers an SDK agent may present as caller ID and which one a
 * given call actually dials from. This is a thin adapter over the exact same
 * services the web dialer + extension use — the SDK is treated as the `web`
 * outbound surface (there is no `sdk` value in the `OutboundSource` enum), so
 * caller-ID gating stays identical while the Call itself is stamped
 * `source = "sdk"`.
 */
@Injectable()
export class SdkCallerIdResolver {
  constructor(
    private readonly numbers: NumberPurchasedService,
    private readonly callerIds: CallerIdService,
    private readonly rotation: CallerIdRotationService,
    private readonly prisma: PrismaService,
  ) {}

  /** The caller IDs this agent may choose from, for the auth bootstrap. */
  async list(ctx: OwnershipContext, userId: string): Promise<SdkCallerId[]> {
    const allowed = await this.numbers
      .listOutboundCallerIds(ctx, { source: "web", userId })
      .catch(() => []);

    // Per-user flags (primary / recording) live on UserNumber; join by numberId.
    const userNumbers = await this.prisma.userNumber
      .findMany({
        where: { userId, enabled: true },
        select: { numberId: true, isPrimary: true, canRecord: true },
      })
      .catch(
        () =>
          [] as { numberId: string; isPrimary: boolean; canRecord: boolean }[],
      );
    const byNumberId = new Map(userNumbers.map((u) => [u.numberId, u]));

    return allowed.map((n) => {
      const un = byNumberId.get(n.id);
      return {
        id: n.id,
        phoneNumber: n.phoneNumber,
        isPrimary: un?.isPrimary ?? false,
        canRecord: un?.canRecord ?? false,
      };
    });
  }

  /**
   * Resolve the E.164 to dial from for one call. Mirrors the extension:
   *   1. an explicit `callerIdId` the agent picked (validated against the
   *      allow-list), else
   *   2. the workspace fixed caller ID passed through the rotation resolver
   *      (rotation ON → country-matched pool pick; OFF → the fixed number).
   * Throws a typed {@link SdkError} when nothing is usable.
   */
  async resolveForDial(
    ctx: OwnershipContext,
    userId: string,
    destination: string,
    opts: { callerIdId?: string; allowOverCap?: boolean } = {},
  ): Promise<{ phoneNumber: string; callerIdId: string | null }> {
    // 1) Explicit pick — validate it is still one of the agent's caller IDs.
    if (opts.callerIdId) {
      const allowed = await this.list(ctx, userId);
      const match = allowed.find((c) => c.id === opts.callerIdId);
      if (!match) {
        throw new SdkError(
          "CALLER_ID_NOT_ALLOWED",
          "The selected caller ID is not available for this agent.",
        );
      }
      return { phoneNumber: match.phoneNumber, callerIdId: match.id };
    }

    // 2) Fixed caller ID → rotation-aware resolution.
    const fixed = await this.resolveFixedCallerId(ctx);
    const selection = await this.rotation.selectForDial(
      ctx,
      destination,
      { phoneNumber: fixed },
      { allowOverCap: opts.allowOverCap === true },
    );
    if (!selection.phoneNumber) {
      if (selection.reason === "no_caller_id_for_country") {
        throw new SdkError(
          "NO_CALLER_ID",
          "No caller ID is available for this destination's country.",
        );
      }
      throw new SdkError(
        "NO_CALLER_ID",
        "No caller ID is available for this workspace.",
      );
    }
    return { phoneNumber: selection.phoneNumber, callerIdId: null };
  }

  private async resolveFixedCallerId(
    ctx: OwnershipContext,
  ): Promise<string | null> {
    const callerIds = await this.callerIds
      .getCallerIds(ctx)
      .catch(() => [] as Array<{ verified?: boolean; phoneNumber?: string }>);
    const verified = callerIds.find((c) => c.verified && c.phoneNumber);
    if (verified?.phoneNumber) return verified.phoneNumber;

    const numbers = await this.numbers
      .findByOwner(ctx)
      .catch(() => [] as Array<{ phoneNumber?: string }>);
    if (numbers[0]?.phoneNumber) return numbers[0].phoneNumber;

    return apiConfiguration.RINGEE_PUBLIC_CALLER_ID || null;
  }

  static isE164(value: string): boolean {
    return E164.test(value);
  }
}
