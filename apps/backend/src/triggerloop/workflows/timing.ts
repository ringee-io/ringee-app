const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Per-step schedules. Index matches how many times that step has already
 * fired (executionCount for that stepKey). If the user advances, the schedule
 * for the NEW step starts over at index 0.
 */
export const STEP_SCHEDULES: Record<string, readonly number[]> = {
  firstCallFollowup: [10 * MINUTE, 6 * HOUR, 24 * HOUR, 3 * DAY, 7 * DAY],
  creditsFollowup: [1 * HOUR, 24 * HOUR, 4 * DAY, 7 * DAY],
  numberPurchaseFollowup: [1 * DAY, 3 * DAY, 7 * DAY, 10 * DAY],
  contactsImportFollowup: [1 * DAY, 3 * DAY, 5 * DAY, 7 * DAY],
  campaignsCallbacksAdoptionFollowup: [5 * DAY, 8 * DAY, 12 * DAY, 14 * DAY],
  teamSetupFollowup: [7 * DAY, 10 * DAY, 14 * DAY],
  reactivationFollowup: [7 * DAY, 14 * DAY, 21 * DAY, 30 * DAY],
};

/**
 * Returns the delay for the (n+1)-th firing of a step. If the schedule has
 * been exhausted the workflow should close — returns null to signal that.
 */
export function nextDelayForStep(
  stepKey: string,
  firingIndex: number,
): number | null {
  const schedule = STEP_SCHEDULES[stepKey];
  if (!schedule) return null;
  return schedule[firingIndex] ?? null;
}

/**
 * How many times a given stepKey has already produced an action in this
 * workflow instance. We count actionKeys tagged with a deterministic prefix.
 */
export function countFiringsForStep(
  stepKey: string,
  sentActionKeys: string[],
): number {
  return sentActionKeys.filter((k) => k.startsWith(`${stepKey}:`)).length;
}
