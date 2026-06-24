/** Formats a USD amount the same way as the rest of the numbers UI ($X.XX). */
export function formatUsd(amount: number): string {
  return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}
