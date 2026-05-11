'use client';

import { Alert, AlertDescription, AlertTitle } from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ringee/frontend-shared/components/ui/tabs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { AlertCircle, Plug, RefreshCw, Sparkles, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useCrmConnections } from '../hooks/use-crm-connections';
import type { CrmConnectionSummary, CrmProviderType } from '../types/crm';
import { PROVIDER_META } from '../types/crm';
import { AttioAppTokenSection } from './attio-app-token-section';
import { CrmConnectionCard } from './crm-connection-card';
import { ProviderCatalog } from './provider-catalog';
import { ConnectionManagementSheet } from './connection-management-sheet';
import { EnrichmentTab } from './tabs/enrichment-tab';
import { LeadSearchPanel } from './lead-search-panel';

export default function IntegrationsViewPage() {
  const t = useTranslations('crm');
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connections, loading, error, reload } = useCrmConnections();
  const [manageConnection, setManageConnection] = useState<CrmConnectionSummary | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const notifiedRef = useRef<string | null>(null);

  useEffect(() => {
    const crm = searchParams.get('crm');
    const provider = searchParams.get('provider');
    const reason = searchParams.get('reason');
    if (!crm) return;
    const key = `${crm}:${provider}:${reason}`;
    if (notifiedRef.current === key) return;
    notifiedRef.current = key;
    if (crm === 'connected' && provider) {
      toast.success(`${PROVIDER_META[provider as CrmProviderType]?.name ?? provider} connected`);
      reload();
    } else if (crm === 'error') {
      toast.error(
        `Connection failed${reason ? `: ${reason}` : ''}. Please try again.`,
      );
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('crm');
    url.searchParams.delete('provider');
    url.searchParams.delete('reason');
    url.searchParams.delete('connectionId');
    router.replace(url.pathname + (url.search ? url.search : ''));
  }, [searchParams, router, reload]);

  const handleConnect = async (
    provider: CrmProviderType,
    scope: 'personal' | 'organization',
  ) => {
    // Odoo uses credential-based auth (not OAuth) — we show a hint and let
    // the user re-enter credentials via the dialog in the catalog below.
    if (provider === 'odoo_14_18' || provider === 'odoo_19_plus') {
      toast.info(
        'Use the Odoo card below to re-enter your credentials and reconnect.',
      );
      return;
    }
    try {
      const current =
        typeof window !== 'undefined'
          ? window.location.href.split('?')[0]
          : undefined;
      const res = await api.get<{ url: string }>(
        `/crm/${provider}/oauth/start`,
        { scope, ...(current ? { redirect: current } : {}) },
      );
      if (res?.url) {
        window.location.href = res.url;
      } else {
        toast.error('Could not start authorization');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start auth');
    }
  };

  const handleDisconnect = async (id: string) => {
    setDisconnectingId(id);
    try {
      await api.delete(`/crm/connections/${id}`);
      toast.success('Connection disconnected');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleForget = async (id: string) => {
    setDisconnectingId(id);
    try {
      await api.post(`/crm/connections/${id}/forget`);
      toast.success('Connection forgotten');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to forget');
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      await api.post(`/crm/connections/${id}/sync`);
      toast.success(t('syncSuccess'));
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('syncError'));
    } finally {
      setSyncingId(null);
    }
  };

  const handleManage = (id: string) => {
    const conn = connections.find((c) => c.id === id) ?? null;
    setManageConnection(conn);
  };

  const connectedProviders = useMemo(
    () =>
      Array.from(
        new Set(
          connections
            .filter((c) => c.status === 'active')
            .map((c) => c.provider),
        ),
      ),
    [connections],
  );

  const needsAttention = connections.filter(
    (c) => c.status === 'error' || c.status === 'revoked',
  );

  return (
    <Tabs defaultValue="crm" className="w-full">
      <TabsList>
        <TabsTrigger value="crm">{t('tabs.crm')}</TabsTrigger>
        <TabsTrigger value="enrichment" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> {t('tabs.enrichment')}
        </TabsTrigger>
        <TabsTrigger value="leads" className="gap-1.5">
          <Users className="h-3.5 w-3.5" /> {t('tabs.leads')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="enrichment" className="mt-6">
        <EnrichmentTab />
      </TabsContent>

      <TabsContent value="leads" className="mt-6">
        <LeadSearchPanel />
      </TabsContent>

      <TabsContent value="crm" className="mt-6">
        <CrmTabContent
          loading={loading}
          error={error}
          connections={connections}
          needsAttention={needsAttention}
          connectedProviders={connectedProviders}
          disconnectingId={disconnectingId}
          syncingId={syncingId}
          onReload={reload}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onForget={handleForget}
          onManage={handleManage}
          onSync={handleSync}
          t={t}
        />
      </TabsContent>

      <ConnectionManagementSheet
        connection={manageConnection}
        open={!!manageConnection}
        onOpenChange={(open) => !open && setManageConnection(null)}
      />
    </Tabs>
  );
}

type TFunc = (key: string, values?: Record<string, unknown>) => string;

interface CrmTabContentProps {
  loading: boolean;
  error: string | null;
  connections: CrmConnectionSummary[];
  needsAttention: CrmConnectionSummary[];
  connectedProviders: CrmProviderType[];
  disconnectingId: string | null;
  syncingId: string | null;
  onReload: () => void;
  onConnect: (provider: CrmProviderType, scope: 'personal' | 'organization') => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
  onForget: (id: string) => Promise<void>;
  onManage: (id: string) => void;
  onSync: (id: string) => Promise<void>;
  t: TFunc;
}

function CrmTabContent({
  loading,
  error,
  connections,
  needsAttention,
  connectedProviders,
  disconnectingId,
  syncingId,
  onReload,
  onConnect,
  onDisconnect,
  onForget,
  onManage,
  onSync,
  t,
}: CrmTabContentProps) {
  return (
    <div className="flex flex-col gap-8">
      {needsAttention.length > 0 && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <AlertTitle>
            {t('connections.needsAttention', { count: needsAttention.length })}
          </AlertTitle>
          <AlertDescription>
            {t('connections.needsAttentionDescription')}
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('connections.yourConnections')}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReload()}
            disabled={loading}
            className="h-8"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            {t('connections.refresh')}
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('connections.loadError')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : connections.length === 0 ? (
          <EmptyState t={t} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {connections.map((c) => (
              <CrmConnectionCard
                key={c.id}
                connection={c}
                onDisconnect={onDisconnect}
                onForget={onForget}
                onReconnect={onConnect}
                onViewHistory={(id) => onManage(id)}
                onManage={onManage}
                onSync={onSync}
                syncing={syncingId === c.id}
                disconnecting={disconnectingId === c.id}
              />
            ))}
          </div>
        )}
      </section>

      <AttioAppTokenSection />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('connections.available')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('connections.availableDescription')}
          </p>
        </div>
        <ProviderCatalog
          onConnect={onConnect}
          connectedProviders={connectedProviders}
          onReload={onReload}
        />
      </section>
    </div>
  );
}

function EmptyState({ t }: { t: TFunc }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Plug className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-2 text-sm font-semibold">{t('connections.noConnections')}</h3>
      <p className="max-w-sm text-xs text-muted-foreground">
        {t('connections.noConnectionsDescription')}
      </p>
    </div>
  );
}
