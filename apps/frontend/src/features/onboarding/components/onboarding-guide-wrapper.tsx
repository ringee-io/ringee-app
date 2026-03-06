'use client';

import { OnboardingGuide } from './onboarding-guide';
import { FirstCallModal } from './first-call-modal';

export function OnboardingGuideWrapper() {
  return (
    <>
      <OnboardingGuide />
      <FirstCallModal />
    </>
  );
}

