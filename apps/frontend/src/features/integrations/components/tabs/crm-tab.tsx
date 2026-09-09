'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { AlertCircle, Plug, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useCrmConnections } from '../../hooks/use-crm-connections';
import type { CrmConnectionSummary, CrmProviderType } from '../../types/crm';
import { PROVIDER_META } from '../../types/crm';
import { AttioAppTokenSection } from '../attio-app-token-section';
import { ConnectionManagementSheet } from '../connection-management-sheet';
import { CrmConnectionCard } from '../crm-connection-card';
import { ProviderCatalog } from '../provider-catalog';

interface CrmTabProps {
  /**
   * Where the provider sends the browser back after OAuth. Defaults to the
   * current page, which is what the standalone Integrations page wants. The
   * settings dialog passes the Integrations page instead, because the dialog
   * itself is gone by the time the redirect lands and the success toast has to
   * have somewhere to appear.
   */
  oauthReturnUrl?: string;
}

/**
 * CRM connections pane: live connections, the Attio app token, and the catalog
 * of providers still available. Owns the OAuth round-trip for CRM providers.
 */
export function CrmTab({ oauthReturnUrl }: CrmTabProps) {
  const t = useTranslations('crm');
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connections, loading, error, reload } = useCrmConnections();
  const [manageConnection, setManageConnection] =
    useState<CrmConnectionSummary | null>(null);
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
      toast.success(
        t('toasts.providerConnected', {
          provider: PROVIDER_META[provider as CrmProviderType]?.name ?? provider
        })
      );
      reload();
    } else if (crm === 'error') {
      toast.error(
        reason
          ? t('toasts.connectionFailedReason', { reason })
          : t('toasts.connectionFailed')
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
    scope: 'personal' | 'organization'
  ) => {
    // Odoo uses credential-based auth (not OAuth) — we show a hint and let
    // the user re-enter credentials via the dialog in the catalog below.
    if (provider === 'odoo_14_18' || provider === 'odoo_19_plus') {
      toast.info(t('toasts.odooHint'));
      return;
    }
    try {
      // The provider needs an absolute URL, and the callback appends its own
      // `?crm=…` params to whatever we send. So strip both the query and the
      // fragment: a `#…` left on the end would swallow those params (the
      // callback's `?` would land inside the fragment) and the success toast
      // would never fire. `oauthReturnUrl` may be given as a path.
      const current =
        typeof window === 'undefined'
          ? undefined
          : new URL(
              oauthReturnUrl ?? window.location.pathname,
              window.location.origin
            ).toString();
      const res = await api.get<{ url: string }>(
        `/crm/${provider}/oauth/start`,
        { scope, ...(current ? { redirect: current } : {}) }
      );
      if (res?.url) {
        window.location.href = res.url;
      } else {
        toast.error(t('toasts.authStartError'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.authError'));
    }
  };

  const handleDisconnect = async (id: string) => {
    setDisconnectingId(id);
    try {
      await api.delete(`/crm/connections/${id}`);
      toast.success(t('toasts.disconnected'));
      await reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('toasts.disconnectError')
      );
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleForget = async (id: string) => {
    setDisconnectingId(id);
    try {
      await api.post(`/crm/connections/${id}/forget`);
      toast.success(t('toasts.forgotten'));
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.forgetError'));
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
            .map((c) => c.provider)
        )
      ),
    [connections]
  );

  const needsAttention = connections.filter(
    (c) => c.status === 'error' || c.status === 'revoked'
  );

  return (
    <>
      <div className='flex flex-col gap-8'>
        {needsAttention.length > 0 && (
          <Alert className='border-amber-500/30 bg-amber-500/5'>
            <AlertCircle className='h-4 w-4 text-amber-500' />
            <AlertTitle>
              {t('connections.needsAttention', {
                count: needsAttention.length
              })}
            </AlertTitle>
            <AlertDescription>
              {t('connections.needsAttentionDescription')}
            </AlertDescription>
          </Alert>
        )}

        <section className='flex flex-col gap-4'>
          <div className='flex items-center justify-between'>
            <div>
              <h2 className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
                {t('connections.yourConnections')}
              </h2>
            </div>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => reload()}
              disabled={loading}
              className='h-8'
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              {t('connections.refresh')}
            </Button>
          </div>

          {loading ? (
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className='h-52 w-full rounded-xl' />
              ))}
            </div>
          ) : error ? (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>{t('connections.loadError')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : connections.length === 0 ? (
            <EmptyState />
          ) : (
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {connections.map((c) => (
                <CrmConnectionCard
                  key={c.id}
                  connection={c}
                  onDisconnect={handleDisconnect}
                  onForget={handleForget}
                  onReconnect={handleConnect}
                  onViewHistory={(id) => handleManage(id)}
                  onManage={handleManage}
                  onSync={handleSync}
                  syncing={syncingId === c.id}
                  disconnecting={disconnectingId === c.id}
                />
              ))}
            </div>
          )}
        </section>

        <AttioAppTokenSection />

        <section className='flex flex-col gap-4'>
          <div>
            <h2 className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
              {t('connections.available')}
            </h2>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('connections.availableDescription')}
            </p>
          </div>
          <ProviderCatalog
            onConnect={handleConnect}
            connectedProviders={connectedProviders}
            onReload={reload}
          />
        </section>
      </div>

      <ConnectionManagementSheet
        connection={manageConnection}
        open={!!manageConnection}
        onOpenChange={(open) => !open && setManageConnection(null)}
      />
    </>
  );
}

function EmptyState() {
  const t = useTranslations('crm');

  return (
    <div className='bg-muted/20 flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center'>
      <div className='bg-muted flex h-12 w-12 items-center justify-center rounded-full'>
        <Plug className='text-muted-foreground h-5 w-5' />
      </div>
      <h3 className='mt-2 text-sm font-semibold'>
        {t('connections.noConnections')}
      </h3>
      <p className='text-muted-foreground max-w-sm text-xs'>
        {t('connections.noConnectionsDescription')}
      </p>
    </div>
  );
}
