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

export interface CarrierConnectionService {
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
