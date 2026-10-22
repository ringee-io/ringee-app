import { CallOutcome, Prisma } from "@prisma/client";
import { attemptOutcomeSql } from "./campaign-conversion.sql";

/**
 * What counts as an answered — connected — call (CALL-012): one definition for
 * every query that counts them, so the dashboard (`DashboardRepository`), the
 * campaign dashboard (`OutboundAnalyticsRepository`) and the backoffice
 * (`BackofficeCampaignRepository`) read a voicemail the same way.
 *
 * A call connected when `answeredAt` is set — stamped by the `call.answered`
 * webhook — whether or not anybody recorded an outcome for it: counting only
 * dispositioned calls hid every connected call that went without one.
 * `completed` status is never a signal; every call reaches it on hangup.
 *
 * What was recorded only overrules the pickup the other way. A mailbox's
 * greeting (and fake answer supervision on some international routes) stamps
 * `answeredAt` too, so an answer recorded as voicemail or no answer reached no
 * person.
 *
 * Constant SQL, built from no input: safe to interpolate into a raw query.
 */
export const UNANSWERED_OUTCOMES: CallOutcome[] = [
  CallOutcome.no_answer,
  CallOutcome.voicemail,
];

const UNANSWERED_SQL_LIST = UNANSWERED_OUTCOMES.map((o) => `'${o}'`).join(",");

/**
 * A server-originated voicemail drop (CALL-003) is a leg nobody is on: the
 * carrier dials, answering-machine detection waits out the greeting and the
 * asset plays into the mailbox. The mailbox's pickup stamps `answeredAt` and
 * nobody records an outcome, so without this every delivered drop read as an
 * answered call.
 *
 * The leg is recognised by the `client_state` it was dialed with
 * (`VoicemailDropService.sendVoicemail`) — the marker `isServerOriginatedDrop`
 * reads, not `source`, which the caller may override. It is stored base64 and
 * its JSON opens with the drop's `action`; cut at a 3-byte boundary, the
 * encoding of that opening does not depend on what follows it.
 */
const DROP_STATE_OPENING = '{"action":"voicemail_drop';
export const VOICEMAIL_DROP_STATE_PREFIX = Buffer.from(
  DROP_STATE_OPENING.slice(
    0,
    DROP_STATE_OPENING.length - (DROP_STATE_OPENING.length % 3),
  ),
).toString("base64");

/**
 * The calls CALL-012 counts as answered, as the members of a Prisma `AND` — so
 * they compose with an outcome filter instead of replacing it. `unreached` are
 * the outcomes that overrule the pickup. The `null` arms matter: `notIn` and
 * `NOT`, like SQL's NOT IN, drop NULL rows — exactly the calls nobody
 * dispositioned, and the legs dialed without a client state.
 */
export function answeredCallWhere(
  unreached: CallOutcome[] = UNANSWERED_OUTCOMES,
): Prisma.CallWhereInput[] {
  return [
    { answeredAt: { not: null } },
    { OR: [{ outcome: null }, { outcome: { notIn: unreached } }] },
    {
      OR: [
        { clientState: null },
        { NOT: { clientState: { startsWith: VOICEMAIL_DROP_STATE_PREFIX } } },
      ],
    },
  ];
}

/** `<the call is answered>` for the `"Call"` row that `alias` names. */
export function isAnsweredCallSql(alias: string): string {
  return `(${alias}."answeredAt" IS NOT NULL
    AND (${alias}.outcome IS NULL OR ${alias}.outcome NOT IN (${UNANSWERED_SQL_LIST}))
    AND (${alias}."clientState" IS NULL OR ${alias}."clientState" NOT LIKE '${VOICEMAIL_DROP_STATE_PREFIX}%'))`;
}

/**
 * `<the campaign attempt connected>`: picked up, and not recorded as reaching
 * no one — read on the attempt's canonical outcome (DISP-002), so a workspace
 * disposition such as "Left voicemail" counts as the voicemail it means. An
 * attempt is always the agent's own leg, never a drop. `alias` qualifies the
 * columns.
 */
export function isConnectedAttemptSql(alias?: string): string {
  const answeredAt = alias ? `${alias}."answeredAt"` : `"answeredAt"`;
  const outcome = attemptOutcomeSql(alias);
  return `(${answeredAt} IS NOT NULL AND (${outcome} IS NULL OR ${outcome} NOT IN (${UNANSWERED_SQL_LIST})))`;
}
