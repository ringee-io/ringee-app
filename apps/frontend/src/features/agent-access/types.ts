/** A personal API key as the API returns it — never the secret itself. */
export interface PersonalApiKey {
  id: string;
  name: string;
  prefix: string;
  source: 'dashboard' | 'cli';
  createdAt: string;
  lastUsedAt: string | null;
  lastClientName: string | null;
  lastClientVersion: string | null;
}

/** Returned once, when the key is created. */
export interface CreatedPersonalApiKey extends PersonalApiKey {
  key: string;
}

export type CliAuthRequestState =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'used';

export interface CliAuthWorkspaceOption {
  id: string;
  type: 'personal' | 'organization';
  name: string;
  imageUrl: string | null;
}

export interface CliAuthRequestView {
  userCode: string;
  state: CliAuthRequestState;
  deviceName: string | null;
  platform: string | null;
  clientVersion: string | null;
  requestIp: string | null;
  createdAt: string;
  expiresAt: string;
  workspaces: CliAuthWorkspaceOption[];
  activeWorkspaceId: string;
}
