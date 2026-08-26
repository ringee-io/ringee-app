export type CallCostPart = {
  call_part?: string;
  cost?: string | number;
};

export type CallChargeBreakdown = {
  rawCallCost: number;
  rawRecordingCost: number;
  computedCallCost: number;
  computedRecordingCost: number;
  computedTotalCost: number;
};

const RECORDING_CALL_PART = "call-recording";

const toNonNegativeNumber = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Applies the voice-call multiplier to every Telnyx cost part except recording,
 * which has its own multiplier. When Telnyx omits cost_parts, total_cost is
 * treated as voice-call cost for backwards compatibility.
 */
export const calculateCallCharge = ({
  costParts,
  totalCost,
  callProfitMultiplier,
  recordingProfitMultiplier,
}: {
  costParts?: CallCostPart[] | null;
  totalCost?: string | number | null;
  callProfitMultiplier: number;
  recordingProfitMultiplier: number;
}): CallChargeBreakdown => {
  const usableParts = Array.isArray(costParts)
    ? costParts.filter((part) => toNonNegativeNumber(part.cost) > 0)
    : [];

  const rawCallCost =
    usableParts.length > 0
      ? usableParts
          .filter((part) => part.call_part !== RECORDING_CALL_PART)
          .reduce((sum, part) => sum + toNonNegativeNumber(part.cost), 0)
      : toNonNegativeNumber(totalCost);
  const rawRecordingCost = usableParts
    .filter((part) => part.call_part === RECORDING_CALL_PART)
    .reduce((sum, part) => sum + toNonNegativeNumber(part.cost), 0);

  const computedCallCost = rawCallCost * callProfitMultiplier;
  const computedRecordingCost = rawRecordingCost * recordingProfitMultiplier;

  return {
    rawCallCost,
    rawRecordingCost,
    computedCallCost,
    computedRecordingCost,
    computedTotalCost: computedCallCost + computedRecordingCost,
  };
};
