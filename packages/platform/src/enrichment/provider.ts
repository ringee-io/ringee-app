import { EnrichmentProviderType } from "@ringee/database";
import {
  EmailVerificationResult,
  EnrichmentAccountInfo,
  EnrichmentCapabilities,
  EnrichmentCreditsInfo,
  EnrichmentCredentials,
  EnrichmentResult,
  EnrichOpts,
  LeadSearchFilters,
  LeadSearchOpts,
  LeadSearchResult,
  NameCompanyInput,
} from "./types";

export interface EnrichmentProvider {
  readonly type: EnrichmentProviderType;
  readonly capabilities: EnrichmentCapabilities;

  validateCredentials(
    creds: EnrichmentCredentials,
  ): Promise<EnrichmentAccountInfo>;
  getCredits?(creds: EnrichmentCredentials): Promise<EnrichmentCreditsInfo>;

  enrichByEmail?(
    creds: EnrichmentCredentials,
    email: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByDomain?(
    creds: EnrichmentCredentials,
    domain: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByLinkedIn?(
    creds: EnrichmentCredentials,
    linkedInUrl: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByNameCompany?(
    creds: EnrichmentCredentials,
    input: NameCompanyInput,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByPhone?(
    creds: EnrichmentCredentials,
    phone: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByPersonId?(
    creds: EnrichmentCredentials,
    personId: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;

  verifyEmail?(
    creds: EnrichmentCredentials,
    email: string,
  ): Promise<EmailVerificationResult>;

  searchLeads?(
    creds: EnrichmentCredentials,
    filters: LeadSearchFilters,
    opts?: LeadSearchOpts,
  ): Promise<LeadSearchResult>;
}
