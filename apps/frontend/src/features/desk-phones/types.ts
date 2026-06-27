export type SipDeviceStatus =
  | 'pending'
  | 'registered'
  | 'offline'
  | 'disabled'
  | 'deleted';

export type SipDeviceInboundMode = 'ringee_default' | 'desk_phone_only';

export type SipDeviceType =
  | 'yealink'
  | 'grandstream'
  | 'cisco'
  | 'zoiper'
  | 'other';

export interface SipDevice {
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
  inboundMode: SipDeviceInboundMode;
  callerId: string | null;
  assignedNumber: { id: string; phoneNumber: string } | null;
  telnyxConnectionId: string;
  telnyxConnectionName: string;
  parkOutboundEnabled: boolean;
  lastRegisteredAt: string | null;
  lastIpAddress: string | null;
  lastUserAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SipDeviceCredentials {
  sipServer: string;
  outboundProxy: string;
  port: number;
  transport: 'TLS';
  username: string;
  authId: string;
  password: string;
  callerId: string | null;
  inboundNumber: string | null;
  outboundEnabled: boolean;
  inboundMode: 'desk_phone_only';
}

export interface CreatedSipDevice {
  device: SipDevice;
  credentials: SipDeviceCredentials;
}

export interface AssignableNumber {
  id: string;
  phoneNumber: string;
  inboundMode: SipDeviceInboundMode;
  inboundDeviceLabel: string | null;
}

export interface CreateSipDevicePayload {
  label: string;
  deviceType?: SipDeviceType;
  assignedUserId?: string;
  allowInbound: boolean;
  allowOutbound: boolean;
  numberId?: string | null;
}

export type InboundReroute = 'ringee' | 'device';
