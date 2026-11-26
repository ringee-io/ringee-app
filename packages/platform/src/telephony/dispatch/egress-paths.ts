/**
 * Which Telnyx requests start an outbound call attempt, and so spend CPS.
 *
 * Telnyx's surcharge counts accepted outbound call attempts of SIP Trunking
 * and, from 2026-12-01, of Programmable Voice, Voice API, TeXML and
 * Programmable Fax. The REST calls that create one:
 *
 * | Request                                     | Starts                          |
 * | ------------------------------------------- | ------------------------------- |
 * | `POST /calls`                               | a Call Control Dial             |
 * | `POST /calls/{id}/actions/transfer`         | a new leg to the destination    |
 * | `POST /texml/ai_calls/{app}`                | an AI assistant call (TeXML)    |
 * | `POST /texml/Accounts/{sid}/Calls`          | a TeXML REST call               |
 * | `POST /faxes`                               | a Programmable Fax              |
 *
 * `answer`, `bridge`, `hangup`, `playback_*`, `record_*` and the rest act on a
 * leg that already exists and spend nothing. A transfer is counted although
 * Telnyx's notice does not say it is: pacing one that is not counted costs a
 * few hundred milliseconds of capacity, and not pacing one that is would be an
 * unnoticed hole.
 *
 * This is the single list the Telnyx client consults, so a new call-creating
 * endpoint is added here and nowhere else. Keep it in step with
 * `docs/telnyx-cps-cost-protection.md`.
 */
const CALL_ORIGINATING: readonly RegExp[] = [
  /^\/calls$/,
  /^\/calls\/[^/]+\/actions\/transfer$/,
  /^\/texml\/ai_calls\/[^/]+$/,
  /^\/texml\/accounts\/[^/]+\/calls$/,
  /^\/faxes$/,
];

export function isCallOriginatingRequest(
  method: string,
  path: string,
  body?: unknown,
): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const pathname = withoutTrailingSlashes(
    path.split(/[?#]/, 1)[0],
  ).toLowerCase();
  // Voice verification originates a provider-controlled leg. Pace it
  // conservatively until its surcharge treatment has been reconciled to CDRs.
  if (pathname === "/verified_numbers")
    return (
      !!body &&
      typeof body === "object" &&
      (body as { verification_method?: unknown }).verification_method === "call"
    );
  return CALL_ORIGINATING.some((pattern) => pattern.test(pathname));
}

/**
 * `path` without its trailing `/`s. A loop rather than `/\/+$/`: that regex
 * restarts at every `/` of a run that does not end the path, which is
 * quadratic on a path built from ids a webhook supplied.
 */
function withoutTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end--;
  return path.slice(0, end);
}
