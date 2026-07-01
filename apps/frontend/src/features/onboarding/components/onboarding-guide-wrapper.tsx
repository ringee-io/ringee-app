'use client';

import { OnboardingGuide } from './onboarding-guide';
import { FirstCallModal } from './first-call-modal';
import { FreeCallRequestModal } from './free-call-request-modal';

export function OnboardingGuideWrapper() {
  return (
    <>
      <OnboardingGuide />
      <FirstCallModal />
      <FreeCallRequestModal />
    </>
  );
}
