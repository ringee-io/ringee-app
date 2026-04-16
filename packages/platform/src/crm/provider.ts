import { CrmProviderType } from "@ringee/database";
import {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCapabilities,
  CrmCompanyInput,
  CrmCredentials,
  CrmExchangeParams,
  CrmNoteInput,
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

  // Upsert (Fase 2 for automation; stub-ready now)
  upsertPerson(creds: CrmCredentials, input: CrmPersonInput): Promise<CrmRecordRef>;
  upsertCompany?(creds: CrmCredentials, input: CrmCompanyInput): Promise<CrmRecordRef>;

  // Logging
  logCall(creds: CrmCredentials, input: CrmCallLogInput): Promise<CrmRecordRef>;
  addNote(creds: CrmCredentials, input: CrmNoteInput): Promise<CrmRecordRef>;

  // Tasks (optional)
  createTask?(creds: CrmCredentials, input: CrmTaskInput): Promise<CrmRecordRef>;
}
