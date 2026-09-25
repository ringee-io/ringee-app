/** Provider-neutral SIP Attach contract. Credentials never appear in results. */
export interface CarrierConnectionConfig {
  reference: string;
  /**
   * The signed route key (`signCarrierRouteKey`) that addresses the calls the
   * PBX delivers through this connection to Ringee. Part of every create and
   * update, so a connection is complete before any number is assigned to it.
   */
  routingKey: string;
  proxy: string;
  username: string;
  password: string;
  transport: "UDP" | "TCP" | "TLS";
  authUsername: string | null;
  fromUser: string | null;
  outboundProxy: string | null;
  expirationSec: number;
}

export type CarrierRegistrationState =
  | "registered"
  | "trying"
  | "failed"
  | "unregistering"
  | "disabled"
  | "unknown";

export interface CarrierRegistration {
  status: CarrierRegistrationState;
  providerStatus: string | null;
  lastRegisteredAt: Date | null;
  ipAddress: string | null;
  port: number | null;
  transport: string | null;
}

export interface CarrierConnection {
  id: string;
  reference: string;
  /** Provider-generated host that reaches the PBX; null when not reported. */
  fqdn?: string | null;
}

/** What identifies the configuration Ringee manages on a connection. */
export type CarrierConnectionIdentity = Pick<
  CarrierConnectionConfig,
  "reference" | "routingKey"
>;

export interface CarrierConnectionState extends CarrierConnection {
  /**
   * Whether the provider holds everything Ringee manages on the connection:
   * enabled, callable only from this account, its own provider-side
   * credentials and inbound delivery to Ringee under the expected route key.
   * Says nothing about registration with the PBX.
   */
  complete: boolean;
}

/** Where a call must be sent to reach a destination through the PBX. */
export interface CarrierDialDestination {
  /**
   * `sip:<number>@<fqdn>` — E.164, `+` optional as the carrier takes it — built
   * only from the provider-generated host.
   */
  uri: string;
  fqdn: string;
}

/** A sanitized failure; `uncertain` means a create may have succeeded upstream. */
export class CarrierConnectionError extends Error {
  constructor(
    public readonly uncertain: boolean,
    public readonly notFound = false,
    /** The provider's HTTP status, for diagnostics; null when none was received. */
    public readonly status: number | null = null,
  ) {
    super("The carrier connection provider could not complete the request.");
  }
}

/**
 * Marks the desk phone leg of a call a carrier's PBX delivered to Ringee. The
 * leg carries it in its client state (webhooks of the Call Control leg) and in
 * a SIP header (webhooks of the phone's own connection), so neither is taken
 * for a call of its own.
 */
export const CARRIER_INBOUND_LEG_ACTION = "carrier_inbound_desk_phone";
export const CARRIER_INBOUND_HEADER = "X-Ringee-Carrier-Inbound";

export interface DeskPhoneInboundTransfer {
  /** The desk phone's own SIP identity. */
  sipUsername: string;
  /** E.164 caller ID presented to the phone. */
  from: string;
  /** Shown when the caller had no E.164 number to present. */
  fromDisplayName?: string | null;
  /** Opaque value identifying the original call; see CARRIER_INBOUND_*. */
  correlation: string;
  /** Idempotency key: a redelivered webhook must not ring the phone twice. */
  commandId: string;
  /** How long the phone rings before the attempt ends. */
  timeoutSecs: number;
}

/** The correlation a Call Control leg carries in its client state, if any. */
export function carrierInboundLegCorrelation(
  clientState: string | null | undefined,
): string | null {
  if (!clientState) return null;
  try {
    const state = JSON.parse(Buffer.from(clientState, "base64").toString());
    return state?.action === CARRIER_INBOUND_LEG_ACTION &&
      typeof state.call === "string"
      ? state.call
      : null;
  } catch {
    return null;
  }
}

/**
 * Marks the legs of an outbound call through an external carrier that are not
 * the call itself: the leg sent on through the carrier connection (`carrier`)
 * and, when it only relays the call or was refused, the leg the browser's call
 * arrived on at the Call Control application (`entry`). A marked leg is never a
 * call of its own and is never billed.
 */
export const CARRIER_OUTBOUND_LEG_ACTION = "carrier_outbound_bridge";

export interface CarrierOutboundLeg {
  leg: "entry" | "carrier";
  /** Signed correlation of the call; null on an entry leg that was refused. */
  call: string | null;
}

/** The client state that marks a leg of an outbound carrier call. */
export function carrierOutboundLegState(leg: CarrierOutboundLeg): string {
  return Buffer.from(
    JSON.stringify({ action: CARRIER_OUTBOUND_LEG_ACTION, ...leg }),
  ).toString("base64");
}

/** The outbound carrier leg a client state marks, if any. */
export function carrierOutboundLeg(
  clientState: string | null | undefined,
): CarrierOutboundLeg | null {
  if (!clientState) return null;
  try {
    const state = JSON.parse(Buffer.from(clientState, "base64").toString());
    if (
      state?.action !== CARRIER_OUTBOUND_LEG_ACTION ||
      (state.leg !== "entry" && state.leg !== "carrier")
    )
      return null;
    return {
      leg: state.leg,
      call: typeof state.call === "string" ? state.call : null,
    };
  } catch {
    return null;
  }
}

/** Sends an outbound call parked on the Call Control application to its carrier. */
export interface CarrierOutboundTransfer {
  /**
   * `sip:<number>@<connection host>` — E.164, `+` optional as the carrier takes
   * it — built by the server from its own records.
   */
  destinationUri: string;
  /**
   * The external number the call is placed from, written like the destination
   * (`+` optional as the carrier takes it); a PBX may present its own.
   */
  from: string;
  /** Signed correlation of the call both legs are marked with. */
  correlation: string;
  /** Idempotency key: a redelivered webhook must not dial twice. */
  commandId: string;
  /** How long the destination rings before the attempt ends. */
  timeoutSecs: number;
  /**
   * Whether the entry leg only relays the call — another leg is the call — so
   * its webhooks are marked too. When the entry leg is the call, it keeps
   * reporting the ordinary lifecycle.
   */
  markEntry: boolean;
}

/** The correlation a leg carries in its SIP headers, if any. */
export function carrierInboundHeaderCorrelation(
  headers: unknown,
): string | null {
  if (!Array.isArray(headers)) return null;
  const header = (headers as Array<{ name?: unknown; value?: unknown }>).find(
    (h) =>
      typeof h?.name === "string" &&
      h.name.toLowerCase() === CARRIER_INBOUND_HEADER.toLowerCase(),
  );
  return typeof header?.value === "string" ? header.value : null;
}

export interface CarrierConnectionService {
  /**
   * The SIP address a browser dials to place one pre-dialed call through an
   * external carrier: Ringee's Call Control application, addressed with the
   * call's signed key. Nothing about the carrier is in it.
   */
  getCarrierOutboundEntry(callKey: string): Promise<string>;
  /**
   * Sends the browser's call, parked on the Call Control application, on
   * through the carrier connection. Both legs are marked as part of it.
   */
  connectOutboundToCarrier(
    callControlId: string,
    params: CarrierOutboundTransfer,
  ): Promise<void>;
  /** Ends an entry leg, keeping it marked so its later webhooks are recognized. */
  refuseCarrierOutbound(
    callControlId: string,
    commandId: string,
  ): Promise<void>;
  /**
   * The SIP destination that reaches `destination` through the connection's
   * PBX. `null` when the connection exists but is not callable right now
   * (inactive, or not accepting calls from this account's connections).
   * Throws `CarrierConnectionError` when the provider cannot answer. Never
   * returns registration secrets.
   */
  getCarrierDialDestination(
    id: string,
    destination: string,
  ): Promise<CarrierDialDestination | null>;
  /**
   * Creates the connection complete: the customer's carrier settings plus
   * everything Ringee manages on it, including inbound delivery to Ringee
   * under `config.routingKey`.
   */
  createCarrierConnection(
    config: CarrierConnectionConfig,
  ): Promise<CarrierConnection>;
  /** Applies the complete desired configuration; nothing Ringee manages is dropped. */
  updateCarrierConnection(
    id: string,
    config: CarrierConnectionConfig,
  ): Promise<void>;
  deleteCarrierConnection(id: string): Promise<void>;
  /** Reads the connection back and compares it with what Ringee manages. */
  verifyCarrierConnection(
    id: string,
    expected: CarrierConnectionIdentity,
  ): Promise<CarrierConnectionState>;
  findCarrierConnection(reference: string): Promise<CarrierConnection | null>;
  checkCarrierRegistration(id: string): Promise<CarrierRegistration>;
}
