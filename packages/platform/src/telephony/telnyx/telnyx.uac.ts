import type {
  CarrierConnectionConfig,
  CarrierRegistration,
  CarrierRegistrationState,
} from "../interfaces/carrier-connection";

export function uacPayload(config: CarrierConnectionConfig) {
  return {
    connection_name: config.reference,
    active: true,
    sip_uri_calling_preference: "disabled",
    external_uac_settings: {
      proxy: config.proxy,
      username: config.username,
      password: config.password,
      transport: config.transport,
      auth_username: config.authUsername ?? "",
      from_user: config.fromUser ?? "",
      outbound_proxy: config.outboundProxy ?? "",
      expiration_sec: config.expirationSec,
    },
  };
}

const STATES: Record<string, CarrierRegistrationState> = {
  registered: "registered",
  trying: "trying",
  failed: "failed",
  expired: "failed",
  unregistered: "failed",
  unregistering: "unregistering",
  "connection disabled": "disabled",
  disabled: "disabled",
};

export function mapUacRegistration(raw: unknown): CarrierRegistration {
  const envelope =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // Some API versions wrap the registration a second time.
  const data =
    envelope.data && typeof envelope.data === "object"
      ? (envelope.data as Record<string, unknown>)
      : envelope;
  const label =
    typeof data.status === "string"
      ? data.status.toLowerCase().replace(/_/g, " ").trim()
      : "";
  const date =
    typeof data.last_registration === "string"
      ? new Date(data.last_registration)
      : null;
  return {
    status: STATES[label] ?? "unknown",
    // Allowlist provider status labels: arbitrary provider text can echo secrets.
    providerStatus:
      label in STATES || ["unknown", "not applicable"].includes(label)
        ? label
        : null,
    lastRegisteredAt: date && Number.isFinite(date.getTime()) ? date : null,
    ipAddress:
      typeof data.ip_address === "string" &&
      /^[\da-fA-F:.]{2,45}$/.test(data.ip_address)
        ? data.ip_address
        : null,
    port:
      typeof data.port === "number" &&
      Number.isInteger(data.port) &&
      data.port > 0 &&
      data.port <= 65535
        ? data.port
        : null,
    transport:
      typeof data.transport === "string" &&
      ["UDP", "TCP", "TLS"].includes(data.transport.toUpperCase())
        ? data.transport.toUpperCase()
        : null,
  };
}
