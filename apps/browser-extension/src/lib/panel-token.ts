/**
 * The side panel's session token for API calls.
 *
 * The panel's own Clerk copy holds a ~60 s token and cannot renew it: once that
 * token lapses, every refresh it asks Clerk for fails, so every panel request
 * answered 401 until the panel was reopened. That included saving a call's
 * outcome ("Failed to save outcome", 2026-11-05). The background worker never
 * has this problem, because it loads a fresh Clerk client for each request (see
 * `getToken` in the service worker), and its prepare-call never failed.
 *
 * So the panel uses its own token while it has one, and asks the worker as
 * soon as it has none or the API refused it. The worker's fresh client also
 * shares its token with the panel's Clerk cache, so the next requests go back
 * to the panel's own token without a round trip to the worker.
 *
 * The worker's session is the browser's current one, though, and the API acts
 * for whoever a token belongs to. So a borrowed token is used only when it is
 * for the user and workspace the panel shows.
 */
import {
  MessageType,
  isAuthTokenResult,
  type AuthTokenResult,
  type RequestAuthTokenMsg,
} from "@ringee/dialer-core/contracts";
import type { TokenProvider } from "./ringee-api";

/** A token the worker minted, with whose session it is. */
export type BorrowedToken = AuthTokenResult & { token: string };

/** Who the panel shows: the user and workspace its own Clerk copy loaded. */
export interface PanelIdentity {
  userId?: string | null;
  orgId?: string | null;
}

/** The panel's Clerk `getToken`; `skipCache` asks Clerk for a new token. */
export type ClerkTokenGetter = (opts?: {
  skipCache?: boolean;
}) => Promise<string | null>;

/** How long the panel waits for the worker before going without a token. */
export const WORKER_TOKEN_TIMEOUT_MS = 10_000;

/**
 * Asks the background worker for a token. Calls made while one is in flight
 * share it: a panel whose token lapsed fails every request it has open at the
 * same moment, and a single fresh Clerk client is enough to answer them all.
 * Anything but a valid answer (no listener, a closed channel, a timeout) is
 * treated as no token.
 */
export function workerTokenSource(
  send: (msg: RequestAuthTokenMsg) => Promise<unknown>,
  timeoutMs = WORKER_TOKEN_TIMEOUT_MS,
): () => Promise<BorrowedToken | null> {
  let pending: Promise<BorrowedToken | null> | null = null;
  return () => {
    pending ??= askWorker(send, timeoutMs).finally(() => {
      pending = null;
    });
    return pending;
  };
}

async function askWorker(
  send: (msg: RequestAuthTokenMsg) => Promise<unknown>,
  timeoutMs: number,
): Promise<BorrowedToken | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  try {
    const answer = await Promise.race([
      Promise.resolve()
        .then(() => send({ type: MessageType.RequestAuthToken }))
        .catch(() => undefined),
      late,
    ]);
    return isAuthTokenResult(answer) && answer.token
      ? { ...answer, token: answer.token }
      : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether a borrowed token is for the user and workspace the panel shows. */
function isFor(borrowed: BorrowedToken, shown: PanelIdentity): boolean {
  return (
    !!borrowed.userId &&
    borrowed.userId === shown.userId &&
    (borrowed.orgId ?? null) === (shown.orgId ?? null)
  );
}

/**
 * The panel's `TokenProvider` for `RingeeApi`: its own Clerk token while it
 * has one, and the worker's when it has none. `forceRefresh` is the API's
 * retry after a 401, so the panel's own token is not tried again: the worker's
 * comes first, and Clerk's forced refresh is only the fallback.
 *
 * A borrowed token for anyone but who the panel shows — another user, or the
 * same user in another workspace, signed in since the panel loaded — is
 * refused, and so is renewing the panel's own session, which the browser has
 * left: the request goes without a token until the panel is reopened.
 */
export function panelTokenProvider(
  clerkToken: ClerkTokenGetter,
  workerToken: () => Promise<BorrowedToken | null>,
  shown: () => PanelIdentity,
): TokenProvider {
  return async (opts) => {
    if (!opts?.forceRefresh) {
      const own = await clerkToken().catch(() => null);
      if (own) return own;
    }
    const borrowed = await workerToken().catch(() => null);
    if (borrowed) return isFor(borrowed, shown()) ? borrowed.token : null;
    return clerkToken({ skipCache: true }).catch(() => null);
  };
}
