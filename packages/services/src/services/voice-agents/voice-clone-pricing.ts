/** A quote is snapshotted on the clone so later configuration changes cannot reprice it. */
export function calculateVoiceClonePrice(
  providerCostUsd: number,
  profitMultiplier: number,
) {
  if (
    !Number.isFinite(providerCostUsd) ||
    providerCostUsd < 0 ||
    !Number.isFinite(profitMultiplier) ||
    profitMultiplier < 1
  ) {
    throw new Error("Invalid voice cloning price configuration");
  }
  const amountUsd = Math.round(providerCostUsd * profitMultiplier * 1e6) / 1e6;
  if (!Number.isFinite(amountUsd))
    throw new Error("Invalid voice cloning price");
  return {
    providerCostUsd,
    profitMultiplier,
    amountUsd,
    currency: "USD" as const,
  };
}
