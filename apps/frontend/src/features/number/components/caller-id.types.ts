/** A verified caller ID (a NumberPurchased row with kind = verified_caller_id). */
export interface CallerId {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  verified: boolean;
  active: boolean;
  verificationStatus?: string | null;
  verificationMethod?: string | null;
  createdAt: string;
}

export type CallerIdStatus = 'verified' | 'pending' | 'failed' | 'inactive';

export function resolveCallerIdStatus(callerId: CallerId): CallerIdStatus {
  if (!callerId.verified) {
    if ((callerId.verificationStatus ?? '').startsWith('failed')) {
      return 'failed';
    }
    return 'pending';
  }
  return callerId.active ? 'verified' : 'inactive';
}
