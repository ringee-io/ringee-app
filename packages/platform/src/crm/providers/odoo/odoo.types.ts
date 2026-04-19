/**
 * Shared type definitions for both Odoo providers (odoo_14_18 and
 * odoo_19_plus).
 *
 * Odoo connections are credential-based (not OAuth). The tokens stored in
 * `CrmConnection.accessTokenCiphertext` hold a JSON blob produced by
 * `serializeOdooCredentials()`, keeping us inside the existing provider
 * interface without changing the schema.
 */

export type OdooApiMode = "rpc" | "json2";

export type OdooCredentialPayload = {
  baseUrl: string;
  database: string;
  login: string;
  apiKey: string;
  // Cached after first successful authenticate (RPC uid, or JSON-2 session).
  // Does not require revalidation, but a fallback re-auth is always attempted
  // by the client if a call looks like it hit an invalid session.
  uid?: number | null;
};

export type OdooConnectionMetadata = {
  mode: OdooApiMode;
  serverVersion?: string | null;
  serverSeries?: string | null; // e.g. "15.0" or "19.0"
  companyId?: number | null;
  companyName?: string | null;
};

export type OdooPartnerRecord = {
  id: number;
  name: string | null;
  display_name?: string | null;
  email?: string | false | null;
  phone?: string | false | null;
  mobile?: string | false | null;
  is_company?: boolean;
  company_name?: string | null;
  parent_id?: [number, string] | false | null;
  function?: string | false | null;
  user_id?: [number, string] | false | null;
  website?: string | false | null;
  industry_id?: [number, string] | false | null;
};

export type OdooUserRecord = {
  id: number;
  name: string;
  login: string;
  email?: string | false | null;
};

export type OdooLeadRecord = {
  id: number;
  name: string;
  partner_id?: [number, string] | false | null;
  user_id?: [number, string] | false | null;
};

export type OdooActivityRecord = {
  id: number;
  summary?: string | false;
  note?: string | false;
  res_model: string;
  res_id: number;
};

export type OdooMessageRecord = {
  id: number;
  res_model?: string;
  res_id?: number;
};
