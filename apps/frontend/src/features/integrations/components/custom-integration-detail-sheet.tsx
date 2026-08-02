'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@ringee/frontend-shared/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCustomIntegrationActions,
  useCustomIntegrations
} from '../hooks/use-custom-integrations';
import {
  ALL_OUTBOUND_EVENTS,
  type CustomIntegrationDeliveryLog,
  type CustomIntegrationEventType,
  type CustomIntegrationInboundLog,
  type CustomIntegrationSummary
} from '../types/custom-integrations';
import { CustomIntegrationEventsDocs } from './custom-integration-events-docs';

interface Props {
  item: CustomIntegrationSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBaseUrl: string;
}

export function CustomIntegrationDetailSheet({
  item,
  open,
  onOpenChange,
  apiBaseUrl
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-3xl'>
        {item ? (
          <Body
            item={item}
            apiBaseUrl={apiBaseUrl}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  item,
  apiBaseUrl,
  onClose
}: {
  item: CustomIntegrationSummary;
  apiBaseUrl: string;
  onClose: () => void;
}) {
  const { update, remove } = useCustomIntegrations();
  const actions = useCustomIntegrationActions(item.id);

  return (
    <>
      <SheetHeader>
        <SheetTitle className='flex items-center gap-2'>
          {item.name}
          <Badge variant='outline' className='text-[10px]'>
            {item.status}
          </Badge>
        </SheetTitle>
        <SheetDescription>
          Custom integration created on{' '}
          {new Date(item.createdAt).toLocaleString()}.
        </SheetDescription>
      </SheetHeader>

      <Tabs defaultValue='settings' className='mx-4 mt-6'>
        <TabsList>
          <TabsTrigger value='settings'>Settings</TabsTrigger>
          <TabsTrigger value='inbound'>Inbound</TabsTrigger>
          <TabsTrigger value='outbound'>Outbound</TabsTrigger>
          <TabsTrigger value='logs'>Logs</TabsTrigger>
          <TabsTrigger value='docs'>Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value='settings' className='mt-5 space-y-6'>
          <SettingsTab
            item={item}
            update={update}
            remove={remove}
            actions={actions}
            onClose={onClose}
          />
        </TabsContent>

        <TabsContent value='inbound' className='mt-5 space-y-4'>
          <InboundTab
            apiBaseUrl={apiBaseUrl}
            apiKeyPrefix={item.apiKeyPrefix}
          />
        </TabsContent>

        <TabsContent value='outbound' className='mt-5 space-y-4'>
          <OutboundTab
            item={item}
            update={update}
            testWebhook={actions.testWebhook}
          />
        </TabsContent>

        <TabsContent value='logs' className='mt-5'>
          <LogsTab actions={actions} />
        </TabsContent>

        <TabsContent value='docs' className='mt-5'>
          <CustomIntegrationEventsDocs />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ── Settings ──────────────────────────────────────────────────────────

function SettingsTab({
  item,
  update,
  remove,
  actions,
  onClose
}: {
  item: CustomIntegrationSummary;
  update: ReturnType<typeof useCustomIntegrations>['update'];
  remove: ReturnType<typeof useCustomIntegrations>['remove'];
  actions: ReturnType<typeof useCustomIntegrationActions>;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [active, setActive] = useState(item.status === 'active');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await update(item.id, {
        name,
        status: active ? 'active' : 'disabled'
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Label htmlFor='ci-name'>Name</Label>
        <Input
          id='ci-name'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className='flex items-center justify-between rounded-md border p-3'>
        <div>
          <p className='text-sm font-medium'>Enabled</p>
          <p className='text-muted-foreground text-xs'>
            When disabled, the API key stops accepting requests and no outbound
            events are delivered.
          </p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>

      <div className='space-y-2'>
        <Label className='text-muted-foreground text-xs tracking-wide uppercase'>
          API Key prefix
        </Label>
        <div className='bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2'>
          <code className='flex-1 font-mono text-xs'>{item.apiKeyPrefix}…</code>
        </div>
        <p className='text-muted-foreground flex gap-1.5 text-xs'>
          <AlertTriangle className='mt-0.5 h-3 w-3 text-amber-500' />
          For security, only a prefix is shown after creation. Regenerate to get
          a new key.
        </p>
      </div>

      <RegenerateButtons actions={actions} />

      <PublishableKeysSection actions={actions} />

      <div className='flex justify-between border-t pt-4'>
        <Button
          variant='destructive'
          onClick={async () => {
            try {
              await remove(item.id);
              onClose();
              toast.success('Integration deleted');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Delete failed');
            }
          }}
        >
          Delete integration
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function RegenerateButtons({
  actions
}: {
  actions: ReturnType<typeof useCustomIntegrationActions>;
}) {
  const [revealed, setRevealed] = useState<{
    label: string;
    value: string;
  } | null>(null);
  const [busy, setBusy] = useState<'api' | 'secret' | null>(null);

  const rotateApi = async () => {
    setBusy('api');
    try {
      const res = await actions.regenerateApiKey();
      setRevealed({ label: 'New API key', value: res.apiKey });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rotate failed');
    } finally {
      setBusy(null);
    }
  };
  const rotateSecret = async () => {
    setBusy('secret');
    try {
      const res = await actions.regenerateSigningSecret();
      setRevealed({ label: 'New signing secret', value: res.signingSecret });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rotate failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className='space-y-3'>
      <div className='flex gap-2'>
        <Button variant='outline' onClick={rotateApi} disabled={busy !== null}>
          {busy === 'api' && (
            <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
          )}
          Regenerate API Key
        </Button>
        <Button
          variant='outline'
          onClick={rotateSecret}
          disabled={busy !== null}
        >
          {busy === 'secret' && (
            <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
          )}
          Regenerate signing secret
        </Button>
      </div>
      {revealed && (
        <CopyableSecret
          label={revealed.label}
          value={revealed.value}
          onDismiss={() => setRevealed(null)}
        />
      )}
    </div>
  );
}

// ── Dialer SDK · Publishable keys ────────────────────────────────────

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // An origin carries no path/query/hash.
    if (u.pathname !== '/' || u.search || u.hash) return null;
    return u.origin;
  } catch {
    return null;
  }
}

function PublishableKeysSection({
  actions
}: {
  actions: ReturnType<typeof useCustomIntegrationActions>;
}) {
  const [origins, setOrigins] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    publishableKey: string;
    allowedOrigins: string[];
  } | null>(null);

  const addOrigin = (raw: string) => {
    const origin = normalizeOrigin(raw);
    if (!origin) {
      toast.error('Enter a full origin, e.g. https://crm.example.com');
      return;
    }
    setOrigins((prev) => (prev.includes(origin) ? prev : [...prev, origin]));
    setDraft('');
  };

  const generate = async () => {
    setBusy(true);
    try {
      const res = await actions.mintPublishableKey(origins);
      setResult({
        publishableKey: res.publishableKey,
        allowedOrigins: res.allowedOrigins
      });
      toast.success('Publishable key generated');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not generate key'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-3 rounded-md border p-3'>
      <div className='flex items-start gap-2'>
        <KeyRound className='mt-0.5 h-4 w-4 text-indigo-500' />
        <div className='min-w-0'>
          <p className='text-sm font-medium'>Dialer SDK · Publishable keys</p>
          <p className='text-muted-foreground text-xs'>
            Browser-safe{' '}
            <code className='bg-muted rounded px-1 py-0.5'>pk_live_…</code> for{' '}
            <code className='bg-muted rounded px-1 py-0.5'>
              @ringee/dialer-sdk
            </code>
            . Scope it to the exact origins where the SDK loads.
          </p>
        </div>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='ci-origin' className='text-xs'>
          Allowed origins
        </Label>
        <div className='flex gap-2'>
          <Input
            id='ci-origin'
            value={draft}
            placeholder='https://crm.example.com'
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOrigin(draft);
              }
            }}
          />
          <Button
            variant='outline'
            onClick={() => addOrigin(draft)}
            disabled={!draft.trim()}
          >
            <Plus className='mr-1 h-3.5 w-3.5' /> Add
          </Button>
        </div>

        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='text-muted-foreground text-xs'>Quick add:</span>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 px-2 text-xs'
            onClick={() => addOrigin(window.location.origin)}
          >
            This dashboard
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 px-2 text-xs'
            onClick={() => addOrigin('https://playground.ringee.io')}
          >
            https://playground.ringee.io (playground)
          </Button>
        </div>

        {origins.length > 0 && (
          <div className='flex flex-wrap gap-1.5'>
            {origins.map((o) => (
              <Badge
                key={o}
                variant='secondary'
                className='gap-1 font-mono text-[11px]'
              >
                {o}
                <button
                  type='button'
                  aria-label={`Remove ${o}`}
                  className='hover:text-destructive'
                  onClick={() =>
                    setOrigins((prev) => prev.filter((x) => x !== o))
                  }
                >
                  <X className='h-3 w-3' />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Button onClick={generate} disabled={busy || origins.length === 0}>
        {busy ? (
          <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
        ) : (
          <KeyRound className='mr-1.5 h-3.5 w-3.5' />
        )}
        Generate publishable key
      </Button>

      {result && (
        <div className='space-y-2'>
          <CopyableSecret
            label='Publishable key'
            value={result.publishableKey}
            onDismiss={() => setResult(null)}
          />
          <p className='text-muted-foreground text-xs'>
            Scoped to: {result.allowedOrigins.join(', ')}. Rotating the API key
            revokes every publishable key for this integration.
          </p>
        </div>
      )}
    </div>
  );
}

function CopyableSecret({
  label,
  value,
  onDismiss
}: {
  label: string;
  value: string;
  onDismiss?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className='rounded-md border border-amber-500/30 bg-amber-500/5 p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-semibold tracking-wide text-amber-500 uppercase'>
          {label}
        </span>
        {onDismiss && (
          <Button size='sm' variant='ghost' onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
      <p className='text-muted-foreground mt-1 text-xs'>
        Copy this now — it will not be shown again.
      </p>
      <div className='bg-background mt-2 flex items-center gap-2 rounded-md border px-3 py-2'>
        <code className='flex-1 truncate font-mono text-xs'>{value}</code>
        <Button
          size='icon'
          variant='ghost'
          className='h-7 w-7'
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast.success('Copied');
          }}
        >
          {copied ? (
            <Check className='h-3.5 w-3.5' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Inbound ──────────────────────────────────────────────────────────

function InboundTab({
  apiBaseUrl,
  apiKeyPrefix
}: {
  apiBaseUrl: string;
  apiKeyPrefix: string;
}) {
  const url = `${apiBaseUrl}/api/integrations/custom/webhook`;
  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Send events from your system to this URL. Authenticate every request
        with your API key.
      </p>
      <UrlBlock label='Webhook URL' value={url} />
      <div className='space-y-1'>
        <Label className='text-muted-foreground text-xs tracking-wide uppercase'>
          Required header
        </Label>
        <div className='bg-muted/30 rounded-md border px-3 py-2 font-mono text-xs'>
          X-Ringee-Api-Key: {apiKeyPrefix}…
        </div>
      </div>
      <div className='space-y-1'>
        <Label className='text-muted-foreground text-xs tracking-wide uppercase'>
          Example request
        </Label>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 font-mono text-[11px] leading-relaxed'>
          {`curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -H "X-Ringee-Api-Key: ${apiKeyPrefix}…" \\
  -d '{
    "event": "contact.upserted",
    "eventId": "evt_01HX5Z7K8MZP1Q4V0G9YJ2RH3T",
    "occurredAt": "2026-05-23T14:30:00.000Z",
    "data": {
      "externalId": "ext_contact_42",
      "phoneNumber": "+14155550123",
      "firstName": "Ada"
    }
  }'`}
        </pre>
      </div>
      <p className='text-muted-foreground text-xs'>
        Supported inbound events:{' '}
        <code className='bg-muted rounded px-1.5 py-0.5'>contact.upserted</code>
        ,{' '}
        <code className='bg-muted rounded px-1.5 py-0.5'>company.upserted</code>
        ,{' '}
        <code className='bg-muted rounded px-1.5 py-0.5'>contact.deleted</code>,{' '}
        <code className='bg-muted rounded px-1.5 py-0.5'>company.deleted</code>.
        See the Documentation tab for full schemas.
      </p>
    </div>
  );
}

function UrlBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className='space-y-1'>
      <Label className='text-muted-foreground text-xs tracking-wide uppercase'>
        {label}
      </Label>
      <div className='bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2'>
        <code className='flex-1 truncate font-mono text-xs'>{value}</code>
        <Button
          size='icon'
          variant='ghost'
          className='h-7 w-7'
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast.success('Copied');
          }}
        >
          {copied ? (
            <Check className='h-3.5 w-3.5' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Outbound ─────────────────────────────────────────────────────────

function OutboundTab({
  item,
  update,
  testWebhook
}: {
  item: CustomIntegrationSummary;
  update: ReturnType<typeof useCustomIntegrations>['update'];
  testWebhook: () => Promise<{
    ok: boolean;
    statusCode?: number;
    latencyMs: number;
    error?: string;
  }>;
}) {
  const [url, setUrl] = useState(item.outboundUrl ?? '');
  const [events, setEvents] = useState<CustomIntegrationEventType[]>(
    item.subscribedEvents
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const toggleEvent = (e: CustomIntegrationEventType) => {
    setEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await update(item.id, {
        outboundUrl: url.trim() || null,
        subscribedEvents: events
      });
      toast.success('Outbound webhook updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await testWebhook();
      if (res.ok) {
        toast.success(`Webhook OK — ${res.statusCode} in ${res.latencyMs}ms`);
      } else {
        toast.error(
          `Webhook failed — ${res.error ?? `HTTP ${res.statusCode}`}`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <Label htmlFor='ci-url'>Destination URL</Label>
        <div className='flex gap-2'>
          <Input
            id='ci-url'
            value={url}
            placeholder='https://your-app.com/webhooks/ringee'
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            variant='outline'
            onClick={handleTest}
            disabled={testing || !item.outboundUrl}
          >
            {testing ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <Send className='mr-1.5 h-3.5 w-3.5' />
            )}
            Test
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          Ringee signs each request with your signing secret. The header{' '}
          <code className='bg-muted rounded px-1 py-0.5'>Ringee-Signature</code>{' '}
          contains{' '}
          <code className='bg-muted rounded px-1 py-0.5'>
            t=&lt;unixSec&gt;,v1=&lt;hex&gt;
          </code>
          .
        </p>
      </div>

      <div className='space-y-2'>
        <Label>Subscribed events</Label>
        <div className='grid grid-cols-2 gap-2'>
          {ALL_OUTBOUND_EVENTS.map((evt) => (
            <label
              key={evt.value}
              className='hover:bg-muted/30 flex cursor-pointer items-start gap-2 rounded-md border p-2.5'
            >
              <Checkbox
                checked={events.includes(evt.value)}
                onCheckedChange={() => toggleEvent(evt.value)}
              />
              <div className='min-w-0'>
                <code className='text-xs'>{evt.label}</code>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className='flex justify-end border-t pt-4'>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ── Logs ─────────────────────────────────────────────────────────────

function LogsTab({
  actions
}: {
  actions: ReturnType<typeof useCustomIntegrationActions>;
}) {
  return (
    <Tabs defaultValue='inbound'>
      <TabsList>
        <TabsTrigger value='inbound'>Inbound</TabsTrigger>
        <TabsTrigger value='outbound'>Outbound</TabsTrigger>
      </TabsList>
      <TabsContent value='inbound' className='mt-4'>
        <InboundLogsList getLogs={actions.getInboundLogs} />
      </TabsContent>
      <TabsContent value='outbound' className='mt-4'>
        <OutboundLogsList getLogs={actions.getOutboundLogs} />
      </TabsContent>
    </Tabs>
  );
}

function InboundLogsList({
  getLogs
}: {
  getLogs: () => Promise<CustomIntegrationInboundLog[]>;
}) {
  const [rows, setRows] = useState<CustomIntegrationInboundLog[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getLogs());
    } finally {
      setLoading(false);
    }
  }, [getLogs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <LogsListShell
      loading={loading}
      empty={!rows || rows.length === 0}
      onRefresh={refresh}
    >
      {rows?.map((r) => (
        <li
          key={r.id}
          className='flex items-center justify-between gap-3 px-3 py-2 text-xs'
        >
          <div className='flex min-w-0 items-center gap-3'>
            <StatusBadge status={r.status} />
            <code className='truncate'>{r.eventType}</code>
            <span className='text-muted-foreground truncate'>
              {r.externalEventId}
            </span>
          </div>
          <span className='text-muted-foreground shrink-0'>
            {new Date(r.receivedAt).toLocaleString()}
          </span>
        </li>
      ))}
    </LogsListShell>
  );
}

function OutboundLogsList({
  getLogs
}: {
  getLogs: () => Promise<CustomIntegrationDeliveryLog[]>;
}) {
  const [rows, setRows] = useState<CustomIntegrationDeliveryLog[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getLogs());
    } finally {
      setLoading(false);
    }
  }, [getLogs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <LogsListShell
      loading={loading}
      empty={!rows || rows.length === 0}
      onRefresh={refresh}
    >
      {rows?.map((r) => (
        <li
          key={r.id}
          className='flex items-center justify-between gap-3 px-3 py-2 text-xs'
        >
          <div className='flex min-w-0 items-center gap-3'>
            <StatusBadge status={r.status} />
            <code className='truncate'>{r.eventType}</code>
            <span className='text-muted-foreground'>
              attempts={r.attemptCount}
            </span>
          </div>
          <span className='text-muted-foreground shrink-0'>
            {new Date(r.createdAt).toLocaleString()}
          </span>
        </li>
      ))}
    </LogsListShell>
  );
}

function LogsListShell({
  loading,
  empty,
  onRefresh,
  children
}: {
  loading: boolean;
  empty: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className='mb-2 flex justify-end'>
        <Button
          size='sm'
          variant='ghost'
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`}
          />{' '}
          Refresh
        </Button>
      </div>
      {loading && !empty ? (
        <Skeleton className='h-32 w-full rounded-md' />
      ) : empty ? (
        <div className='text-muted-foreground rounded-md border border-dashed py-8 text-center text-xs'>
          No events yet.
        </div>
      ) : (
        <ul className='divide-y rounded-md border'>{children}</ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className = useMemo(() => {
    switch (status) {
      case 'processed':
      case 'sent':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
      case 'failed':
        return 'border-red-500/30 bg-red-500/10 text-red-500';
      case 'skipped':
        return 'border-muted-foreground/30 text-muted-foreground';
      default:
        return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
    }
  }, [status]);
  return (
    <Badge variant='outline' className={`text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}
