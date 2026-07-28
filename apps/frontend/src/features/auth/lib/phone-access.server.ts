import 'server-only';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import {
  hasVerifiedPhoneNumber,
  type PhoneAccessRequirements
} from './phone-verification';

export async function getPhoneAccessRequirements(): Promise<PhoneAccessRequirements> {
  try {
    return await apiServer.get<PhoneAccessRequirements>(
      '/user/access-requirements'
    );
  } catch (error) {
    console.error('Could not load phone access requirements', error);
    // Access requirements fail closed so a transient backend issue cannot
    // accidentally bypass onboarding.
    return { phoneRequired: true, phoneVerified: false };
  }
}

export async function needsPhoneVerification(
  phoneNumbers:
    | Array<{ verification?: { status?: string | null } | null }>
    | null
    | undefined
): Promise<boolean> {
  const requirements = await getPhoneAccessRequirements();
  return (
    requirements.phoneRequired &&
    !requirements.phoneVerified &&
    !hasVerifiedPhoneNumber(phoneNumbers)
  );
}
