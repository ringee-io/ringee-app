export type RegistrationStatus =
  | 'registered'
  | 'trying'
  | 'failed'
  | 'unregistering'
  | 'disabled'
  | 'unknown';
export interface ExternalNumber {
  id: string;
  phoneNumber: string;
  active: boolean;
  source: 'external_carrier';
}
export interface SipEndpoint {
  id: string;
  extension: string;
  proxy: string;
  sipUsername: string;
  authUsername: string | null;
  fromUser: string | null;
  outboundProxy: string | null;
  transport: 'UDP' | 'TCP' | 'TLS';
  expirationSec: number;
  syncStatus: 'pending' | 'synced' | 'error' | 'unknown' | 'deleting';
  registrationStatus: RegistrationStatus;
  lastRegisteredAt: string | null;
  lastCheckedAt: string | null;
  numbers: ExternalNumber[];
}
export interface ExternalCarrier {
  id: string;
  name: string;
  status: 'active' | 'deleting';
  source: 'external_carrier';
  endpoints: SipEndpoint[];
}
export type EndpointInput = Pick<
  SipEndpoint,
  | 'extension'
  | 'proxy'
  | 'sipUsername'
  | 'transport'
  | 'authUsername'
  | 'fromUser'
  | 'outboundProxy'
  | 'expirationSec'
> & { password?: string };
export interface NumberInput {
  endpointId: string;
  phoneNumber: string;
  active: boolean;
}
