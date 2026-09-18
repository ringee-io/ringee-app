/** Provider-neutral SIP Attach contract. Credentials never appear in results. */
export interface CarrierConnectionConfig {
  reference: string;
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

/** Where a call must be sent to reach a destination through the PBX. */
export interface CarrierDialDestination {
  /** `sip:<E.164>@<fqdn>`, built only from the provider-generated host. */
  uri: string;
  fqdn: string;
}

/** A sanitized failure; `uncertain` means a create may have succeeded upstream. */
export class CarrierConnectionError extends Error {
  constructor(
    public readonly uncertain: boolean,
    public readonly notFound = false,
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
   * Sends calls the PBX delivers to the connection's extension to Ringee's
   * Call Control application, addressed with `routingKey`.
   */
  configureCarrierInbound(id: string, routingKey: string): Promise<void>;
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
  createCarrierConnection(
    config: CarrierConnectionConfig,
  ): Promise<CarrierConnection>;
  updateCarrierConnection(
    id: string,
    config: CarrierConnectionConfig,
  ): Promise<void>;
  deleteCarrierConnection(id: string): Promise<void>;
  getCarrierConnection(id: string): Promise<CarrierConnection>;
  findCarrierConnection(reference: string): Promise<CarrierConnection | null>;
  checkCarrierRegistration(id: string): Promise<CarrierRegistration>;
}
