export type CrmProviderType =
  | 'attio'
  | 'hubspot'
  | 'gohighlevel'
  | 'salesforce'
  | 'odoo_14_18'
  | 'odoo_19_plus';
export type CrmAuthKind = 'oauth' | 'odoo_credentials';
export type CrmConnectionScope = 'personal' | 'organization';
export type CrmConnectionStatus =
  | 'active'
  | 'error'
  | 'revoked'
  | 'disconnected';
export type CrmSyncStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'needs_resolution';

export interface CrmConnectionSummary {
  id: string;
  provider: CrmProviderType;
  scope: CrmConnectionScope;
  status: CrmConnectionStatus;
  accountName: string | null;
  accountId: string;
  lastSyncAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  pending: number;
  failed: number;
  needsResolution: number;
  done: number;
}

export interface CrmCallSyncRow {
  id: string;
  connectionId: string;
  provider: CrmProviderType;
  callId: string;
  status: CrmSyncStatus;
  idempotencyKey: string;
  externalActivityId: string | null;
  externalRecordId: string | null;
  externalRecordType: string | null;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmFieldMapping {
  id: string;
  connectionId: string;
  provider: CrmProviderType;
  ringeeEntity: string;
  ringeeField: string;
  externalEntity: string;
  externalField: string;
  transform: Record<string, unknown> | null;
  direction: 'push' | 'pull' | 'bidirectional';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CrmListRef {
  externalId: string;
  name: string;
  type?: string;
}

export interface CrmOwnerRef {
  externalId: string;
  email: string;
  name: string;
}

export interface CrmContactSyncResult {
  contactId: string;
  created: boolean;
}

export interface CrmCompanySyncResult {
  companyId: string;
  created: boolean;
}

export const PROVIDER_META: Record<
  CrmProviderType,
  {
    name: string;
    description: string;
    color: string;
    available: boolean;
    logo: string;
    logoDarkInvert: boolean;
    authKind: CrmAuthKind;
    /** Short subtitle shown under the title (e.g. API mode tag). */
    subtitle?: string;
  }
> = {
  attio: {
    name: 'Attio',
    description:
      'Sync call activity, dispositions, recordings and notes to your Attio workspace.',
    color: 'bg-violet-500/15 text-violet-500 border-violet-500/20',
    available: true,
    logo: '/companies/attio.svg',
    logoDarkInvert: true,
    authKind: 'oauth'
  },
  odoo_14_18: {
    name: 'Odoo 14–18',
    description:
      'Legacy RPC compatibility. Best for existing Odoo instances running versions 14 to 18.',
    color: 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/20',
    available: true,
    logo: '/companies/odoo.svg',
    logoDarkInvert: false,
    authKind: 'odoo_credentials',
    subtitle: 'Legacy RPC'
  },
  odoo_19_plus: {
    name: 'Odoo 19+',
    description:
      'Modern JSON-2 API. Best for newer Odoo instances (19 and above).',
    color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
    available: true,
    logo: '/companies/odoo.svg',
    logoDarkInvert: false,
    authKind: 'odoo_credentials',
    subtitle: 'JSON-2 API'
  },
  hubspot: {
    name: 'HubSpot',
    description:
      'Sync contacts, companies, calls, notes, tasks and meetings with HubSpot.',
    color: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
    available: true,
    logo: '/companies/hubspot.svg',
    logoDarkInvert: false,
    authKind: 'oauth'
  },
  gohighlevel: {
    name: 'GoHighLevel',
    description:
      'Connect a HighLevel sub-account to sync contacts, calls, notes, tasks and meetings.',
    color: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/20',
    available: true,
    logo: '/companies/gohighlevel.svg',
    logoDarkInvert: false,
    authKind: 'oauth',
    subtitle: 'Location OAuth'
  },
  salesforce: {
    name: 'Salesforce',
    description: 'Coming soon — enterprise-grade sync with SFDC objects.',
    color: 'bg-sky-500/15 text-sky-500 border-sky-500/20',
    available: false,
    logo: '/companies/salesforce.svg',
    logoDarkInvert: false,
    authKind: 'oauth'
  }
};

export const ODOO_VALIDATION_MESSAGES: Record<string, string> = {
  invalid_credentials:
    'The login or API key was rejected. Double-check the API key and — for Odoo 14–18 — your login/email.',
  database_not_found:
    'The database name could not be found on this Odoo server.',
  invalid_base_url: 'The Odoo URL is unreachable. Check the URL and try again.',
  unsupported_version:
    'This Odoo version is older than 14 and is not supported.',
  api_mode_not_available:
    'The selected API mode is not available on this server. Try the other Odoo option.',
  crm_module_missing:
    'The Odoo CRM module is not installed. Lead sync will not work.',
  insufficient_permissions:
    'This API key does not have permission to modify res.partner.',
  partner_access_denied:
    'This API key cannot read res.partner on the selected database.',
  activity_access_denied: 'This API key cannot create mail.activity records.',
  unknown_odoo_error:
    "Odoo returned an error we couldn't map. Check the server logs."
};
