import { CrmProviderType } from "@ringee/database";
import {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCapabilities,
  CrmCompanyInput,
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
  CrmCredentials,
  CrmExchangeParams,
  CrmListRef,
  CrmNoteInput,
  CrmOwnerRef,
  CrmPersonInput,
  CrmRecordMatch,
  CrmRecordRef,
  CrmTaskInput,
  CrmTokenSet,
  CrmWorkspaceInfo,
} from "./types";

export interface CrmProvider {
  readonly type: CrmProviderType;
  readonly capabilities: CrmCapabilities;

  // OAuth
  getAuthorizationUrl(params: CrmAuthorizeParams): string;
  exchangeCode(params: CrmExchangeParams): Promise<CrmTokenSet>;
  refreshToken(refreshToken: string): Promise<CrmTokenSet>;
  revoke?(token: string): Promise<void>;

  // Identity
  getWorkspaceInfo(creds: CrmCredentials): Promise<CrmWorkspaceInfo>;

  // Matching
  searchByPhone(
    creds: CrmCredentials,
    phoneE164: string,
    opts?: { limit?: number },
  ): Promise<CrmRecordMatch[]>;
  searchByEmail?(
    creds: CrmCredentials,
    email: string,
    opts?: { limit?: number },
  ): Promise<CrmRecordMatch[]>;
  searchCompanyByDomain?(
    creds: CrmCredentials,
    domain: string,
  ): Promise<CrmCompanyMatch[]>;

  // Upsert
  upsertPerson(creds: CrmCredentials, input: CrmPersonInput): Promise<CrmRecordRef>;
  upsertCompany?(creds: CrmCredentials, input: CrmCompanyInput): Promise<CrmRecordRef>;

  // Logging
  logCall(creds: CrmCredentials, input: CrmCallLogInput): Promise<CrmRecordRef>;
  addNote(creds: CrmCredentials, input: CrmNoteInput): Promise<CrmRecordRef>;

  // Tasks (optional)
  createTask?(creds: CrmCredentials, input: CrmTaskInput): Promise<CrmRecordRef>;

  // Record fetch (inbound sync)
  fetchPerson?(creds: CrmCredentials, externalId: string): Promise<CrmContactSyncResult>;
  fetchCompany?(creds: CrmCredentials, externalId: string): Promise<CrmCompanySyncResult>;

  // Lists/segments
  listLists?(creds: CrmCredentials): Promise<CrmListRef[]>;

  // Owners/members
  listMembers?(creds: CrmCredentials): Promise<CrmOwnerRef[]>;
}
