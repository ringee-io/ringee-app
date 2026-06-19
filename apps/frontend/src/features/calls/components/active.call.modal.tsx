'use client';

// The Active Call Modal now lives in @ringee/dialer-ui and is the single,
// shared implementation used by both the web app and the browser extension.
// Re-exported here so existing `./active.call.modal` imports keep working.
export { ActiveCallModal } from '@ringee/dialer-ui';
export type { ActiveCallModalProps } from '@ringee/dialer-ui';
