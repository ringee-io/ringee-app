/**
 * The slices of HubSpot's API this adapter reads and writes. Only the fields
 * Ringee uses are declared; everything HubSpot documents as optional is
 * optional here too.
 */

export type HubSpotTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  hub_id?: number;
  scopes?: string[];
};

export type HubSpotTokenIntrospection = {
  active?: boolean;
  hub_id?: number;
  hub_domain?: string;
  app_id?: number;
  scopes?: string[];
};

/**
 * Error bodies. CRM endpoints answer `{ status: "error", message, category }`;
 * the OAuth endpoints answer RFC 6749 `{ error, error_description }` and keep
 * the legacy `status` (`BAD_REFRESH_TOKEN`) alongside it; a 429 names the
 * exhausted `policyName`.
 */
export type HubSpotErrorBody = {
  status?: string;
  message?: string;
  category?: string;
  correlationId?: string;
  error?: string;
  error_description?: string;
  errorType?: string;
  policyName?: string;
};

/** Every property value arrives as a string (or null when unset). */
export type HubSpotProperties = Record<string, string | null | undefined>;

export type HubSpotObject = {
  id: string;
  properties: HubSpotProperties;
  archived?: boolean;
};

export type HubSpotPage<T> = {
  results: T[];
  paging?: { next?: { after?: string } };
  total?: number;
};

export type HubSpotAssociationInput = {
  to: { id: string };
  types: Array<{
    associationCategory: "HUBSPOT_DEFINED";
    associationTypeId: number;
  }>;
};

export type HubSpotCreateInput = {
  properties: Record<string, string>;
  associations?: HubSpotAssociationInput[];
};

export type HubSpotFilter = {
  propertyName: string;
  operator: "EQ" | "CONTAINS_TOKEN";
  value: string;
};

export type HubSpotSearchRequest = {
  filterGroups: Array<{ filters: HubSpotFilter[] }>;
  properties?: string[];
  limit?: number;
  after?: string;
};

export type HubSpotOwner = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  archived?: boolean;
};

export type HubSpotList = {
  listId: string;
  name: string;
  objectTypeId?: string;
  additionalProperties?: Record<string, string | null | undefined>;
};

export type HubSpotListSearchResponse = {
  lists?: HubSpotList[];
  hasMore?: boolean;
  offset?: number;
};

export type HubSpotFile = {
  id: string;
  name?: string;
};
