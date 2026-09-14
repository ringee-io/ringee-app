/** Organization id used by the API for "personal (no organization)" activity. */
export const PERSONAL_ORGANIZATION_ID = 'none';

export interface AccountFilterOption {
  id: string;
  name: string;
}

/**
 * The client / organization narrowing shared by the backoffice analytics pages.
 * Both halves are optional and combine: a client inside one organization.
 */
export interface AccountFilter {
  organization: AccountFilterOption | null;
  client: AccountFilterOption | null;
}

export const NO_ACCOUNT_FILTER: AccountFilter = {
  organization: null,
  client: null
};

/** The query params every filtered backoffice endpoint accepts. */
export function accountFilterParams(filter: AccountFilter): {
  userId?: string;
  organizationId?: string;
} {
  return {
    userId: filter.client?.id,
    organizationId: filter.organization?.id
  };
}
