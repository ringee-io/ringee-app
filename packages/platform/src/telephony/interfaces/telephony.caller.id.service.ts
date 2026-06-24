export interface TelephonyCallerIdService {
  requestCallIdVerification(
    phoneNumber: string,
    method: "sms" | "call",
    extension?: string,
  ): Promise<void>;

  submitCallIdVerificationCode(
    phoneNumber: string,
    verificationCode: string,
  ): Promise<{ isVerified: boolean }>;

  listVerifiedNumbers(): Promise<
    Array<{ phoneNumber: string; verified: boolean }>
  >;

  deleteVerifiedNumber(phoneNumber: string): Promise<void>;
}
