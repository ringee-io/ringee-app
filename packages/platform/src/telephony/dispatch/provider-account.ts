/**
 * Which provider BILLING account an outbound attempt is charged to (CPS-005).
 *
 * Telnyx bills its CPS surcharge per account, not per API key, SIP connection,
 * integration, IP address or Ringee organization, so that is the unit the
 * pacing budget is keyed by. Consequences:
 *
 * - two credentials of one Telnyx account share one budget, and rotating a key
 *   never resets it: the reference names the account, not the credential;
 * - ten organizations sharing the Ringee-managed account share one budget;
 * - a customer who connects their OWN Telnyx account gets a budget of their
 *   own — Ringee must not pace their traffic against its bill, and must not
 *   route traffic across accounts to dodge a bill either.
 *
 * Today Ringee has exactly one provider account: the Ringee-managed Telnyx
 * account behind `TELNYX_API_KEY`. External carriers (BYOC) attach a customer's
 * PBX as a UAC connection ON that account, so their legs spend the same budget.
 * Nothing in the code accepts a customer's Telnyx credentials; when it does,
 * it adds a resolver here that returns that customer's account — nothing else
 * changes.
 *
 * The reference is written into Redis keys, logs and metrics. It must never be
 * a credential, and the helper below refuses to let one in by accident.
 */
export interface ProviderAccountRef {
  /** `telnyx` today; a second carrier is a second value. */
  provider: string;
  /** The billing account's reference: stable, not secret. */
  key: string;
}

const SAFE = /[^a-z0-9._-]/g;

const sanitize = (value: string, max: number): string =>
  value.trim().toLowerCase().replace(SAFE, "-").slice(0, max);

/**
 * The shapes of the credentials this codebase handles (a Telnyx `KEY…` v2 key,
 * Stripe `sk_`/`pk_`/`rk_`, a bearer header, a JWT). A best-effort guard, not a
 * proof: the contract is that the reference names an account and is not secret.
 * A UUID or a slug is fine.
 */
const LOOKS_LIKE_CREDENTIAL = /^(KEY[0-9A-Z]|sk_|pk_|rk_|Bearer\s|eyJ)/i;

export function providerAccount(
  provider: string,
  accountRef: string,
): ProviderAccountRef {
  if (LOOKS_LIKE_CREDENTIAL.test(accountRef.trim())) {
    throw new Error(
      "A provider account reference must name the billing account, not a credential.",
    );
  }
  const key = sanitize(accountRef, 64);
  if (!key) throw new Error("A provider account reference cannot be empty.");
  return { provider: sanitize(provider, 24), key };
}

/** What names the account inside a Redis key, so the whole budget shares a slot. */
export function accountSlot(account: ProviderAccountRef): string {
  return `${sanitize(account.provider, 24)}-${sanitize(account.key, 64)}`;
}

export interface ProviderAccountResolver {
  /**
   * The account a new outbound attempt is charged to. `workspaceKey` is there
   * for the day a workspace can bring its own account; today it changes
   * nothing.
   */
  resolve(scope?: { workspaceKey?: string | null }): ProviderAccountRef;
}

/** Everything Ringee dials today goes out on one Ringee-managed Telnyx account. */
export class RingeeManagedAccountResolver implements ProviderAccountResolver {
  private readonly account: ProviderAccountRef;

  constructor(accountRef: string) {
    this.account = providerAccount("telnyx", accountRef);
  }

  resolve(): ProviderAccountRef {
    return this.account;
  }
}
