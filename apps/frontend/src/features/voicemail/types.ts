export interface VoicemailAsset {
  id: string;
  name: string;
  description: string | null;
  fileUrl: string;
  durationSec: number | null;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateVoicemailAssetInput {
  name?: string;
  description?: string;
  fileUrl: string;
  durationSec?: number;
}

/**
 * Everything the voicemail panel needs from its host, so the same UI serves
 * the Clerk-authenticated dashboard and the token-authenticated public
 * session dialer. Hosts differ only in transport, never in behaviour.
 */
export interface VoicemailTransport {
  list(): Promise<VoicemailAsset[]>;
  /** Uploads recorded audio and returns its public URL. */
  upload(blob: Blob, filename: string): Promise<{ url: string }>;
  create(input: CreateVoicemailAssetInput): Promise<VoicemailAsset>;
  /** Sends the asset to the destination this panel was opened for. */
  send(assetId: string): Promise<unknown>;
}
