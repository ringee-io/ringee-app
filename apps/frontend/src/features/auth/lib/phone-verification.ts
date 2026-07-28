type PhoneNumberWithVerification = {
  verification?: {
    status?: string | null;
  } | null;
};

export interface PhoneAccessRequirements {
  phoneRequired: boolean;
  phoneVerified: boolean;
}

export function hasVerifiedPhoneNumber(
  phoneNumbers: PhoneNumberWithVerification[] | null | undefined
): boolean {
  return (
    phoneNumbers?.some(
      (phoneNumber) => phoneNumber.verification?.status === 'verified'
    ) ?? false
  );
}
