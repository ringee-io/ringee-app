'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@ringee/frontend-shared/components/ui/collapsible';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  AlertCircle,
  Bot,
  Building2,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  Terminal,
  User as UserIcon
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ApiKeysSection,
  CodeBlock,
  CopyButton
} from '@/features/agent-access/components/api-keys-section';

type ConnectionMode = 'organization' | 'freelancer';

interface ConnectionInfo {
  mode: ConnectionMode;
  userId: string;
  organizationId: string | null;
  /** Legacy capability URL (user/org ids in the path). */
  url: string;
  /** API-key endpoint (Streamable HTTP). */
  endpoint?: string;
  sseEndpoint?: string;
}

export function ConnectorsTab() {
  const t = useTranslations('integrations.connectors');
  const api = useApi();
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo(await api.get<ConnectionInfo>('/mcp/connection-info'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.loadError'));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className='flex flex-col gap-6'>
      <header className='flex flex-col gap-1'>
        <h2 className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
          {t('title')}
        </h2>
        <p className='text-muted-foreground max-w-2xl text-xs'>
          {t('description')}
        </p>
      </header>

      <McpCard info={info} loading={loading} error={error} />
      <CliCard />
      {info && <LegacyUrl info={info} />}
    </div>
  );
}

function McpCard({
  info,
  loading,
  error
}: {
  info: ConnectionInfo | null;
  loading: boolean;
  error: string | null;
}) {
  const t = useTranslations('integrations.connectors');
  const endpoint = info?.endpoint ?? null;

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start gap-3'>
          <div className='bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'>
            <Bot className='text-primary h-5 w-5' />
          </div>
          <div className='flex flex-col gap-1'>
            <CardTitle className='flex items-center gap-2 text-base'>
              {t('mcp.title')}
              <Badge variant='secondary' className='gap-1 text-[10px]'>
                <Sparkles className='h-3 w-3' /> {t('mcp.badge')}
              </Badge>
            </CardTitle>
            <CardDescription className='max-w-xl'>
              {t('mcp.description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className='flex flex-col gap-6'>
        <div className='flex flex-col gap-1.5'>
          <span className='text-xs font-medium'>{t('mcp.endpointLabel')}</span>
          {loading ? (
            <Skeleton className='h-9 w-full' />
          ) : error ? (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>{t('mcp.loadError')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : endpoint ? (
            <div className='flex items-center gap-2'>
              <Input
                readOnly
                value={endpoint}
                onFocus={(e) => e.currentTarget.select()}
                className='font-mono text-xs'
              />
              <CopyButton value={endpoint} />
            </div>
          ) : null}
          <p className='text-muted-foreground text-xs'>
            {t.rich('mcp.endpointHint', {
              code: (chunks) => (
                <code className='bg-muted rounded px-1 font-mono'>
                  {chunks}
                </code>
              )
            })}
          </p>
        </div>

        <ApiKeysSection endpoint={endpoint} />
      </CardContent>
    </Card>
  );
}

function CliCard() {
  const t = useTranslations('integrations.connectors.cli');
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start gap-3'>
          <div className='bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'>
            <Terminal className='text-primary h-5 w-5' />
          </div>
          <div className='flex flex-col gap-1'>
            <CardTitle className='text-base'>{t('title')}</CardTitle>
            <CardDescription className='max-w-xl'>
              {t.rich('description', {
                code: (chunks) => (
                  <code className='bg-muted rounded px-1 font-mono'>
                    {chunks}
                  </code>
                )
              })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        <CodeBlock code={'npm i -g ringee\nringee login'} />
        <p className='text-muted-foreground text-xs'>{t('hint')}</p>
      </CardContent>
    </Card>
  );
}

function LegacyUrl({ info }: { info: ConnectionInfo }) {
  const t = useTranslations('integrations.connectors.legacy');
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className='text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium'>
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {t('toggle')}
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-3 flex flex-col gap-3 rounded-lg border p-4'>
        <p className='text-muted-foreground text-xs'>{t('description')}</p>
        <div className='flex flex-wrap items-center gap-2'>
          <ModeBadge mode={info.mode} />
          <span className='text-muted-foreground text-xs'>
            {info.mode === 'organization'
              ? t('scopeOrganization')
              : t('scopeFreelancer')}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <Input
            readOnly
            value={info.url}
            onFocus={(e) => e.currentTarget.select()}
            className='font-mono text-xs'
          />
          <CopyButton value={info.url} />
        </div>
        <Alert>
          <ShieldAlert className='h-4 w-4' />
          <AlertTitle className='text-sm'>{t('warningTitle')}</AlertTitle>
          <AlertDescription className='text-xs'>
            {t('warningDescription')}
          </AlertDescription>
        </Alert>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ModeBadge({ mode }: { mode: ConnectionMode }) {
  const t = useTranslations('integrations.connectors.legacy');
  if (mode === 'organization') {
    return (
      <Badge variant='default' className='gap-1.5'>
        <Building2 className='h-3 w-3' /> {t('modeOrganization')}
      </Badge>
    );
  }
  return (
    <Badge variant='outline' className='gap-1.5'>
      <UserIcon className='h-3 w-3' /> {t('modeFreelancer')}
    </Badge>
  );
}
