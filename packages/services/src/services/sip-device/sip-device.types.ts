import { NumberInboundMode, SipDeviceStatus } from "@ringee/database";

/** Device type presets surfaced in the create wizard. */
export type SipDeviceType =
  | "yealink"
  | "grandstream"
  | "cisco"
  | "zoiper"
  | "other";

/** Where inbound for the assigned number ends up when a device is removed. */
export type SipDeviceInboundReroute = "ringee" | "device";

export interface CreateSipDeviceInput {
  label: string;
  /** One of SipDeviceType; validated at the controller boundary. */
  deviceType?: string | null;
  /** Defaults to the acting user when omitted. */
  assignedUserId?: string | null;
  allowInbound?: boolean;
  allowOutbound?: boolean;
  /** Number to use as caller ID and (when allowInbound) inbound target. */
  numberId?: string | null;
}

export interface ChangeNumberInput {
  numberId: string | null;
  allowInbound?: boolean;
}

export interface DeleteSipDeviceInput {
  /** What to do with the assigned number's inbound routing. */
  reroute?: SipDeviceInboundReroute;
  /** Required when reroute = "device". */
  targetDeviceId?: string | null;
}

/** Safe, list-friendly view of a device — never includes the SIP password. */
export interface SipDeviceView {
  id: string;
  publicRef: string;
  label: string;
  deviceType: string | null;
  provider: string;
  userId: string;
  organizationId: string | null;
  sipUsername: string;
  status: SipDeviceStatus;
  allowInbound: boolean;
  allowOutbound: boolean;
  inboundMode: NumberInboundMode;
  callerId: string | null;
  assignedNumber: { id: string; phoneNumber: string } | null;
  telnyxConnectionId: string;
  telnyxConnectionName: string;
  parkOutboundEnabled: boolean;
  lastRegisteredAt: Date | null;
  lastIpAddress: string | null;
  lastUserAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One-time SIP credentials. Returned only at creation and on explicit password
 * regeneration — the password is never readable again after that.
 */
export interface SipDeviceCredentials {
  sipServer: string;
  outboundProxy: string;
  port: number;
  transport: "TLS";
  username: string;
  authId: string;
  password: string;
  callerId: string | null;
  inboundNumber: string | null;
  outboundEnabled: boolean;
  inboundMode: "desk_phone_only";
}

export interface CreatedSipDevice {
  device: SipDeviceView;
  credentials: SipDeviceCredentials;
}
