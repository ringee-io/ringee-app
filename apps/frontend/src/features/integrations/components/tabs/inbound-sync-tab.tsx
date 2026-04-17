'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  CheckCircle2,
  Contact,
  Building2,
  Loader2,
  ArrowDownToLine,
  AlertCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { CrmConnectionSummary } from '../../types/crm';
import { PROVIDER_META } from '../../types/crm';

interface SyncResult {
  type: 'contact' | 'company';
  id: string;
  created: boolean;
}

export function InboundSyncTab({ connection }: { connection: CrmConnectionSummary }) {
  const meta = PROVIDER_META[connection.provider];
  const isActive = connection.status === 'active';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold">Import from {meta.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Pull individual contacts or companies from your CRM into Ringee by their record ID.
          Existing records will be updated; new ones will be created.
        </p>
      </div>

      {!isActive && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p>
            This connection is not active. Reconnect to enable imports.
          </p>
        </div>
      )}

      <SyncForm
        connectionId={connection.id}
        type="contact"
        icon={<Contact className="h-4 w-4" />}
        title="Sync Contact"
        description="Import a person record from your CRM. Their name, email, phone numbers, and job title will sync."
        placeholder="e.g. person_01abc123..."
        disabled={!isActive}
      />

      <Separator />

      <SyncForm
        connectionId={connection.id}
        type="company"
        icon={<Building2 className="h-4 w-4" />}
        title="Sync Company"
        description="Import a company record. Name, domain, industry, and size will sync. If contacts are linked in the CRM, their affiliations will be created."
        placeholder="e.g. company_01xyz789..."
        disabled={!isActive}
      />
    </div>
  );
}

function SyncForm({
  connectionId,
  type,
  icon,
  title,
  description,
  placeholder,
  disabled,
}: {
  connectionId: string;
  type: 'contact' | 'company';
  icon: React.ReactNode;
  title: string;
  description: string;
  placeholder: string;
  disabled: boolean;
}) {
  const api = useApi();
  const [externalId, setExternalId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    if (!externalId.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const endpoint = type === 'contact' ? 'sync-contact' : 'sync-company';
      const res = await api.post<{ contactId?: string; companyId?: string; created?: boolean }>(
        `/crm/connections/${connectionId}/${endpoint}`,
        { externalId: externalId.trim() },
      );
      const id = type === 'contact' ? res.contactId : res.companyId;
      setResult({ type, id: id || '', created: res.created ?? false });
      toast.success(
        res.created
          ? `${type === 'contact' ? 'Contact' : 'Company'} imported`
          : `${type === 'contact' ? 'Contact' : 'Company'} updated`,
      );
      setExternalId('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to sync ${type}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-medium">{title}</h4>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>

      <div className="flex gap-2">
        <Input
          value={externalId}
          onChange={(e) => {
            setExternalId(e.target.value);
            setResult(null);
          }}
          placeholder={placeholder}
          className="font-mono text-sm"
          disabled={disabled || loading}
          onKeyDown={(e) => e.key === 'Enter' && handleSync()}
        />
        <Button
          onClick={handleSync}
          disabled={disabled || loading || !externalId.trim()}
          className="shrink-0"
          size="sm"
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
          )}
          Sync
        </Button>
      </div>

      {result && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span>
            {result.created ? 'Created' : 'Updated'}{' '}
            {result.type === 'contact' ? 'contact' : 'company'}
          </span>
          <Badge variant="outline" className="ml-auto font-mono text-[10px]">
            {result.id.slice(0, 12)}…
          </Badge>
        </div>
      )}
    </div>
  );
}
