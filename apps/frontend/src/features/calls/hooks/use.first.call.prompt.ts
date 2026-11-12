'use client';

import { useEffect, useRef, useState } from 'react';
import { useDialerSessionStore } from '@/features/dialer/store/dialer-session.store';
import { useCallStore } from '../store/call.store';
import { useDialerStore } from '../store/dialer.store';
import { useInboundOffersStore } from '../store/inbound-offers.store';
import { useTelnyxStore } from '../store/telnyx.store';

const STORAGE_PREFIX = 'ringee:first-call-prompt';

/** How often a prompt held back by another dialog looks again. */
const OVERLAY_RECHECK_MS = 800;

/** What decides whether My day opens the first-call prompt on its own. */
export interface FirstCallPromptInput {
  /** The workspace, first-list status, lists, today's queue and line loaded. */
  loaded: boolean;
  /** A list, queued work, or a first-list setup done or still pending. */
  hasWork: boolean;
  /** A link brought a number to call, or the user is already typing one. */
  numberInHand: boolean;
  /** A call was starting, ringing, live or in its wrap-up during this visit. */
  callSeen: boolean;
  /** Another dialog or menu is open over the page right now. */
  overlayOpen: boolean;
}

/** `open` it now, `wait` for the page to settle, or `skip` it this visit. */
export type FirstCallPromptStep = 'open' | 'wait' | 'skip';

/**
 * Work in hand always wins: somebody with a number, a call, a list or a queue
 * goes on with it, and the prompt waits for a later visit. Nothing is decided
 * on data still loading, and nothing opens over another dialog.
 */
export function firstCallPromptStep(
  input: FirstCallPromptInput
): FirstCallPromptStep {
  if (input.numberInHand || input.callSeen) return 'skip';
  if (!input.loaded) return 'wait';
  if (input.hasWork) return 'skip';
  return input.overlayOpen ? 'wait' : 'open';
}

/** The prompt opens on its own once per user and workspace, per browser. */
export function firstCallPromptKey(
  userId: string,
  orgId: string | null | undefined
): string {
  return `${STORAGE_PREFIX}:${userId}:${orgId ?? 'personal'}`;
}

/** Openings seen while this page lives, for a browser without storage. */
const shownHere = new Set<string>();

export function wasFirstCallPromptShown(key: string): boolean {
  if (shownHere.has(key)) return true;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function rememberFirstCallPrompt(key: string): void {
  shownHere.add(key);
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Storage unavailable: remembered until the page reloads.
  }
}

/** The same test the Call page's shortcuts use for "something is open". */
function overlayOpen(): boolean {
  return (
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
    ) !== null
  );
}

/**
 * A call on this screen: one starting, one ringing in that the server named
 * this user's, one live or in its wrap-up — or a campaign session running.
 * The provider offers every inbound leg to every browser (`DEBT-020`), so a
 * ringing leg counts only once its offer is presented here.
 */
export function useCallActivity(): boolean {
  const live = useTelnyxStore((s) => s.activeCall !== null);
  const wrapUp = useCallStore((s) => s.postCallPhase);
  const dialing = useDialerStore((s) => s.dialingNumber !== null);
  const ringing = useInboundOffersStore(
    (s) => Object.keys(s.presented).length > 0
  );
  const session = useDialerSessionStore((s) => s.sessionId !== null);
  return live || wrapUp || dialing || ringing || session;
}

interface FirstCallPromptOptions
  extends Omit<FirstCallPromptInput, 'callSeen' | 'overlayOpen'> {
  /** Who is looking, and in which workspace; null until auth has loaded. */
  workspace: { userId: string; orgId: string | null } | null;
  onOpen: () => void;
}

/**
 * Opens My day's first-call prompt on its own — once per user and workspace
 * in this browser, whether it is then used or dismissed. It waits for
 * everything the decision reads, never opens over another dialog, and stays
 * away for the rest of the visit from anybody who already has something to
 * call or was on a call.
 */
export function useFirstCallPrompt({
  workspace,
  loaded,
  hasWork,
  numberInHand,
  onOpen
}: FirstCallPromptOptions): void {
  const key = workspace
    ? firstCallPromptKey(workspace.userId, workspace.orgId)
    : null;
  const callActive = useCallActivity();
  /** A call was on screen at some point of this visit. */
  const callSeen = useRef(false);
  /** The key decided for this visit — opened, or skipped. */
  const settled = useRef<string | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const [recheck, setRecheck] = useState(0);

  useEffect(() => {
    if (callActive) callSeen.current = true;
    if (!key || settled.current === key) return;
    if (wasFirstCallPromptShown(key)) {
      settled.current = key;
      return;
    }
    const step = firstCallPromptStep({
      loaded,
      hasWork,
      numberInHand,
      callSeen: callSeen.current,
      overlayOpen: loaded && overlayOpen()
    });
    if (step === 'skip') {
      settled.current = key;
      return;
    }
    if (step === 'wait') {
      // Still loading: the next render brings it. A dialog in the way: look
      // again shortly — closing it renders nothing here.
      if (!loaded) return;
      const timer = window.setTimeout(
        () => setRecheck((n) => n + 1),
        OVERLAY_RECHECK_MS
      );
      return () => window.clearTimeout(timer);
    }
    settled.current = key;
    rememberFirstCallPrompt(key);
    onOpenRef.current();
  }, [key, loaded, hasWork, numberInHand, callActive, recheck]);
}
