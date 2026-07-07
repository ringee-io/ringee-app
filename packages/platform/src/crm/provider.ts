import { CrmProviderType } from "@ringee/database";
import { CrmError } from "./errors";
import {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCallLogResult,
  CrmCapabilities,
  CrmCompanyInput,
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
  CrmCredentials,
  CrmExchangeParams,
  CrmListRef,
  CrmMeetingInput,
  CrmMeetingSyncResult,
  CrmNoteInput,
  CrmOwnerRef,
  CrmPagedResult,
  CrmPersonInput,
  CrmRecordMatch,
  CrmRecordRef,
  CrmRecordingUploadInput,
  CrmRecordingUploadResult,
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

  // Decides whether an error raised by `refreshToken()` means the refresh
  // token is no longer accepted (→ mark connection revoked) vs a transient
  // failure that should be retried later. Implemented on AbstractCrmProvider
  // with a sensible default; providers can override.
  isRefreshFailureTerminal(err: CrmError): boolean;

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
  upsertPerson(
    creds: CrmCredentials,
    input: CrmPersonInput,
  ): Promise<CrmRecordRef>;
  upsertCompany?(
    creds: CrmCredentials,
    input: CrmCompanyInput,
  ): Promise<CrmRecordRef>;

  // Logging
  logCall(
    creds: CrmCredentials,
    input: CrmCallLogInput,
  ): Promise<CrmCallLogResult>;
  addNote(creds: CrmCredentials, input: CrmNoteInput): Promise<CrmRecordRef>;

  // Tasks (optional)
  createTask?(
    creds: CrmCredentials,
    input: CrmTaskInput,
  ): Promise<CrmRecordRef>;

  // Meetings (optional)
  upsertMeeting?(
    creds: CrmCredentials,
    input: CrmMeetingInput,
  ): Promise<CrmMeetingSyncResult>;

  // Recording file upload (optional)
  uploadRecording?(
    creds: CrmCredentials,
    input: CrmRecordingUploadInput,
  ): Promise<CrmRecordingUploadResult>;

  // Record fetch (inbound sync)
  fetchPerson?(
    creds: CrmCredentials,
    externalId: string,
  ): Promise<CrmContactSyncResult>;
  fetchCompany?(
    creds: CrmCredentials,
    externalId: string,
  ): Promise<CrmCompanySyncResult>;

  // Bulk listing (paginated)
  listPersons?(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit?: number,
  ): Promise<CrmPagedResult<CrmContactSyncResult>>;
  listCompanies?(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit?: number,
  ): Promise<CrmPagedResult<CrmCompanySyncResult>>;

  // Lists/segments
  listLists?(creds: CrmCredentials): Promise<CrmListRef[]>;

  // Owners/members
  listMembers?(creds: CrmCredentials): Promise<CrmOwnerRef[]>;
}
