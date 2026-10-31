/**
 * The frontends a hosted flow (a Stripe Checkout, an OAuth round-trip) may
 * send the user back to. A client says which one it is on; the server only
 * honors it when it is one of these, so a request can never turn Ringee's
 * own checkout link into a redirect to somebody else's site.
 */
const KNOWN_FRONTEND_ORIGINS = [
  "https://phone.ringee.io",
  "http://localhost:4200",
  "http://localhost:4201",
];

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * `candidate`'s origin when it is the configured frontend (`FRONTEND_URL`) or
 * another known Ringee frontend; otherwise `null`.
 */
export function trustedFrontendOrigin(
  candidate: string | null | undefined,
): string | null {
  const origin = originOf(candidate);
  if (!origin) return null;
  const allowed = new Set(
    [process.env.FRONTEND_URL, ...KNOWN_FRONTEND_ORIGINS]
      .map(originOf)
      .filter((o): o is string => o !== null),
  );
  return allowed.has(origin) ? origin : null;
}
