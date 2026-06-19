'use client';

// The in-call / post-call store now lives in the shared dialer package so the
// web app and the browser extension drive the exact same state. Re-exported
// here to keep every existing `../store/call.store` import working unchanged.
export { useCallStore } from '@ringee/dialer-core/store';
export type { CallOutcome } from '@ringee/dialer-core/store';
