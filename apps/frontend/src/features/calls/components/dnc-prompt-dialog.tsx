'use client';

import { useDncPromptStore } from '../store/dnc-prompt.store';
import { DncWarningModal } from './dnc-warning-modal';

/** The one DNC confirmation for the dashboard, driven by `confirmDncCall()`. */
export function DncPromptDialog() {
  const prompt = useDncPromptStore((s) => s.prompt);
  const settle = useDncPromptStore((s) => s.settle);

  return (
    <DncWarningModal
      open={prompt !== null}
      phoneNumber={prompt?.phoneNumber ?? null}
      reason={prompt?.reason}
      addedAt={prompt?.addedAt}
      onCancel={() => settle(false)}
      onCallAnyway={() => settle(true)}
    />
  );
}
