import type { Call, InboundDestinationType } from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";

/**
 * How the leg that delivered an inbound call can be connected onward. This is
 * a property of the delivery path, not of a carrier: a second carrier that
 * parks its calls on a call-control application reuses `call_control`
 * unchanged, and the routing layer never learns which carrier it was.
 *
 * - `ringee_webrtc` — the call arrived on Ringee's shared WebRTC credential
 *   connection. The browser is already being offered the leg by the provider
 *   and a desk phone is reached by the number's own assignment, so Ringee
 *   notifies and arbitrates rather than commanding legs (`DEBT-020`).
 * - `call_control` — the call is parked on a Call Control application. Legs
 *   are opened server-side to registered per-user browser endpoints and
 *   workspace-owned desk phones, with one atomic winning endpoint.
 */
export type InboundTransport = "ringee_webrtc" | "call_control";

/** Which number model a call was addressed to. */
export type InboundNumberRef = {
  kind: "ringee" | "external";
  id: string;
};

/** Logical directory entry. Never include provider addresses or credentials. */
export interface InboundDirectoryEntry {
  destinationType: "user" | "ring_group" | "desk_phone" | "extension";
  destinationId: string;
  label: string;
  extension?: string;
}

/**
 * What the carrier layer established before routing begins: which number was
 * called, who called, and how this leg can be connected onward. Nothing here
 * says where the call goes — that is the routing layer's decision alone.
 */
export interface InboundCallOrigin {
  transport: InboundTransport;
  /** The number that was called, E.164 when the carrier reported one. */
  toNumber: string;
  /** The caller as reported. */
  fromNumber: string;
  /** The caller's E.164 number, or null when it has none to present. */
  callerId: string | null;
  /** Set when the carrier layer already identified the number row. */
  number?: InboundNumberRef;
  /**
   * The workspace the carrier proved this call came through, when it could.
   * It is a cross-check, never the answer: the resolver still reads ownership
   * off the number row and refuses the call if the two disagree.
   */
  organizationId?: string | null;
  /** Snapshots recorded on the call when it came through a customer carrier. */
  externalCarrierId?: string;
  externalSipEndpointId?: string;
}

/** A destination, resolved down to what ringing it actually needs. */
export type InboundDestination =
  | { type: "user"; userId: string }
  | {
      type: "extension";
      membershipId: string;
      userId: string;
      extension: string;
    }
  | { type: "ai_receptionist"; agentId: string; ownerUserId: string }
  | {
      type: "ring_group";
      ringGroupId: string;
      name: string;
      ringSeconds: number;
      memberUserIds: string[];
      /**
       * The member the call row is attributed to while the group rings. Who
       * actually took it is `Call.answeredByUserId`, claimed on answer.
       */
      ownerUserId: string;
    }
  | {
      type: "desk_phone";
      sipDeviceId: string;
      sipUsername: string;
      ownerUserId: string;
    };

/** Why a call could not be routed. Every one of these is logged, never guessed at. */
export type InboundRoutingFailure =
  | "number_not_found"
  | "number_owner_missing"
  | "destination_missing"
  | "destination_deleted"
  | "destination_foreign_workspace"
  | "destination_not_implemented"
  | "ring_group_empty"
  | "ring_group_no_available_members"
  | "user_unavailable"
  | "desk_phone_unavailable"
  | "agent_unavailable"
  | "transport_cannot_reach_destination"
  | "provider_refused";

/**
 * The answer to "what destination owns this incoming call?".
 *
 * `unknown_number` is not a failure of routing: the number is not one this
 * server serves, and the existing behavior — log and leave the leg alone —
 * is preserved.
 */
export type InboundRouteResolution =
  | { kind: "unknown_number"; detail: string }
  | {
      kind: "unroutable";
      reason: InboundRoutingFailure;
      detail: string;
      /** Present once the number identified a workspace. */
      ctx?: OwnershipContext;
      number?: InboundNumberRef;
      routeId?: string | null;
      destinationType?: InboundDestinationType;
      destinationId?: string | null;
    }
  | {
      kind: "routed";
      ctx: OwnershipContext;
      number: InboundNumberRef;
      /** The number in the form the workspace stores it. */
      phoneNumber: string;
      /** Null when the default applied because no route is configured. */
      routeId: string | null;
      /** `default` is the legacy fallback; see `LegacyInboundFallback`. */
      source: "explicit" | "default";
      destination: InboundDestination;
      /** Set when the number is legacy-routed to a desk phone. */
      legacySipDeviceId?: string | null;
    };

/** What a destination handler is given to work with. */
export interface RouteExecutionRequest {
  /** The one logical Ringee call. Handlers never create a second one. */
  call: Call;
  ctx: OwnershipContext;
  origin: InboundCallOrigin;
  destination: InboundDestination;
  /** The contact Ringee matched the caller to, when it knows one. */
  callerName: string | null;
}

export type RouteExecutionResult =
  | {
      status: "ringing";
      /** How many endpoints were offered the call. */
      targets: number;
    }
  | {
      status: "failed";
      reason: InboundRoutingFailure;
      detail: string;
      /** A message worth showing on the call in history. */
      callerMessage?: string;
    };

/** Destination-specific behavior. One per `InboundDestinationType`. */
export interface InboundDestinationHandler {
  readonly type: InboundDestinationType;
  /** Transports this destination can be reached over. */
  readonly transports: readonly InboundTransport[];
  execute(request: RouteExecutionRequest): Promise<RouteExecutionResult>;
}
