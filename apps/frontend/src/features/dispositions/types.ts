export type DispositionCategory =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'no_contact';

/**
 * A disposition as the API returns it — a workspace's own, or one a campaign
 * was seeded with before workspace dispositions existed (`campaignId` set).
 * `canonicalOutcome` is the `CallOutcome` it means, resolved by the server; a
 * campaign's custom code can mean none.
 */
export interface Disposition {
  id: string;
  campaignId: string | null;
  code: string;
  label: string;
  description?: string | null;
  category: DispositionCategory;
  canonicalOutcome?: string | null;
  color: string | null;
  sortOrder: number;
  triggersRetry: boolean;
  triggersCompletion: boolean;
  triggersDnc: boolean;
  triggersCallback: boolean;
  isActive: boolean;
  isSystem: boolean;
  isDefault?: boolean;
}

/** `GET /dispositions`: a workspace disposition and how it is used. */
export interface WorkspaceDisposition extends Disposition {
  campaignId: null;
  description: string | null;
  canonicalOutcome: string;
  isDefault: boolean;
  /** Recorded on a call: it can be deactivated, not deleted. */
  inUse: boolean;
  /** Campaigns that picked it. */
  campaignCount: number;
}

/** What creating or editing a disposition sends. */
export interface DispositionInput {
  name: string;
  description: string | null;
  color: string | null;
  canonicalOutcome: string;
  isDefault: boolean;
}

/**
 * Where a campaign's dispositions come from: the ones picked for it, the ones
 * it was seeded with before workspace dispositions, or the workspace's
 * default set.
 */
export type CampaignDispositionMode = 'campaign' | 'legacy' | 'workspace';

/** `GET /campaigns/:id/disposition-set`. */
export interface CampaignDispositionSet {
  mode: CampaignDispositionMode;
  dispositions: Disposition[];
}
