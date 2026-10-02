'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Terminal,
  Trash2
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { CreatedPersonalApiKey, PersonalApiKey } from '../types';

const KEY_PLACEHOLDER = '<YOUR_API_KEY>';

/** Copy-to-clipboard button with a short "copied" confirmation. */
export function CopyButton({
  value,
  label,
  className
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const t = useTranslations('integrations.connectors');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('copyError'));
    }
  };

  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      onClick={copy}
      className={className ?? 'shrink-0'}
      aria-label={label ?? t('copy')}
    >
      {copied ? (
        <Check className='h-3.5 w-3.5' />
      ) : (
        <Copy className='h-3.5 w-3.5' />
      )}
      <span className='ml-1.5'>{copied ? t('copied') : t('copy')}</span>
    </Button>
  );
}

/** A monospace block with its own copy button. */
export function CodeBlock({ code }: { code: string }) {
  return (
    <div className='bg-muted/40 relative rounded-md border'>
      <pre className='overflow-x-auto p-3 pr-24 font-mono text-[11px] leading-relaxed whitespace-pre'>
        {code}
      </pre>
      <div className='absolute top-2 right-2'>
        <CopyButton value={code} />
      </div>
    </div>
  );
}

/**
 * Personal API keys for MCP clients and the CLI. The secret is shown exactly
 * once, right after creation, together with ready-to-paste setup snippets that
 * already contain it — so connecting a client is copy, paste, done.
 */
export function ApiKeysSection({ endpoint }: { endpoint: string | null }) {
  const t = useTranslations('integrations.connectors.apiKeys');
  const api = useApi();
  const [keys, setKeys] = useState<PersonalApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedPersonalApiKey | null>(null);
  const [toRevoke, setToRevoke] = useState<PersonalApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setKeys(await api.get<PersonalApiKey[]>('/api-keys'));
    } catch {
      setError(t('loadError'));
    }
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const key = await api.post<CreatedPersonalApiKey>('/api-keys', {
        name: name.trim()
      });
      setCreated(key);
      setCreating(false);
      setName('');
      setKeys((prev) => [key, ...(prev ?? [])]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('createError'));
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async () => {
    if (!toRevoke) return;
    setRevoking(true);
    try {
      await api.delete(`/api-keys/${toRevoke.id}`);
      setKeys((prev) => prev?.filter((k) => k.id !== toRevoke.id) ?? null);
      if (created?.id === toRevoke.id) setCreated(null);
      toast.success(t('revoked', { name: toRevoke.name }));
      setToRevoke(null);
    } catch {
      toast.error(t('revokeError'));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex items-start justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h3 className='text-sm font-semibold'>{t('title')}</h3>
          <p className='text-muted-foreground text-xs'>{t('description')}</p>
        </div>
        {!creating && (
          <Button size='sm' onClick={() => setCreating(true)}>
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            {t('create')}
          </Button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={create}
          className='bg-muted/20 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row'
        >
          <Input
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            aria-label={t('nameLabel')}
          />
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => {
                setCreating(false);
                setName('');
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              type='submit'
              size='sm'
              disabled={!name.trim() || submitting}
            >
              {submitting && (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              )}
              {t('createSubmit')}
            </Button>
          </div>
        </form>
      )}

      {created && (
        <CreatedKeyPanel
          created={created}
          endpoint={endpoint}
          onDone={() => setCreated(null)}
        />
      )}

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>{error}</AlertTitle>
          <AlertDescription>
            <Button variant='link' className='h-auto p-0' onClick={load}>
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : keys === null ? (
        <div className='flex flex-col gap-2'>
          <Skeleton className='h-14 w-full' />
          <Skeleton className='h-14 w-full' />
        </div>
      ) : keys.length === 0 ? (
        <div className='text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-xs'>
          <KeyRound className='h-5 w-5' />
          <span>
            {t.rich('empty', {
              code: (chunks) => <code className='font-mono'>{chunks}</code>
            })}
          </span>
        </div>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {keys.map((key) => (
            <KeyRow
              key={key.id}
              apiKey={key}
              onRevoke={() => setToRevoke(key)}
            />
          ))}
        </ul>
      )}

      <AlertDialog
        open={toRevoke !== null}
        onOpenChange={(open) => !open && !revoking && setToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('revokeTitle', { name: toRevoke?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('revokeDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void revoke();
              }}
              disabled={revoking}
              className='bg-destructive hover:bg-destructive/90 text-white'
            >
              {revoking && (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              )}
              {t('revokeConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function KeyRow({
  apiKey,
  onRevoke
}: {
  apiKey: PersonalApiKey;
  onRevoke: () => void;
}) {
  const t = useTranslations('integrations.connectors.apiKeys');
  const format = useFormatter();
  const now = new Date();
  const Icon = apiKey.source === 'cli' ? Terminal : KeyRound;

  const lastUsed = apiKey.lastUsedAt
    ? apiKey.lastClientName
      ? t('lastUsedWith', {
          time: format.relativeTime(new Date(apiKey.lastUsedAt), now),
          client: apiKey.lastClientName
        })
      : t('lastUsed', {
          time: format.relativeTime(new Date(apiKey.lastUsedAt), now)
        })
    : t('neverUsed');

  return (
    <li className='flex items-center gap-3 px-3 py-2.5'>
      <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md'>
        <Icon className='text-muted-foreground h-4 w-4' />
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate text-sm font-medium'>{apiKey.name}</span>
          {apiKey.source === 'cli' && (
            <Badge variant='secondary' className='text-[10px]'>
              CLI
            </Badge>
          )}
        </div>
        <span className='text-muted-foreground truncate text-xs'>
          <code className='font-mono'>{apiKey.prefix}…</code>
          {' · '}
          {t('created', {
            date: format.dateTime(new Date(apiKey.createdAt), {
              dateStyle: 'medium'
            })
          })}
          {' · '}
          {lastUsed}
        </span>
      </div>
      <Button
        variant='ghost'
        size='sm'
        onClick={onRevoke}
        className='text-muted-foreground hover:text-destructive shrink-0'
        aria-label={t('revokeAria', { name: apiKey.name })}
      >
        <Trash2 className='h-3.5 w-3.5' />
        <span className='ml-1.5 hidden sm:inline'>{t('revoke')}</span>
      </Button>
    </li>
  );
}

function CreatedKeyPanel({
  created,
  endpoint,
  onDone
}: {
  created: CreatedPersonalApiKey;
  endpoint: string | null;
  onDone: () => void;
}) {
  const t = useTranslations('integrations.connectors.apiKeys');
  return (
    <div className='flex flex-col gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4'>
      <div className='flex flex-col gap-0.5'>
        <span className='text-sm font-semibold'>
          {t('createdTitle', { name: created.name })}
        </span>
        <span className='text-muted-foreground text-xs'>
          {t('createdDescription')}
        </span>
      </div>
      <div className='flex items-center gap-2'>
        <Input
          readOnly
          value={created.key}
          onFocus={(e) => e.currentTarget.select()}
          className='font-mono text-xs'
          aria-label={t('keyLabel')}
        />
        <CopyButton value={created.key} />
      </div>
      <SetupSnippets endpoint={endpoint} apiKey={created.key} />
      <div className='flex justify-end'>
        <Button size='sm' variant='outline' onClick={onDone}>
          {t('done')}
        </Button>
      </div>
    </div>
  );
}

/** Ready-to-paste configuration for the common MCP clients and the CLI. */
export function SetupSnippets({
  endpoint,
  apiKey
}: {
  endpoint: string | null;
  apiKey?: string;
}) {
  const t = useTranslations('integrations.connectors.snippets');
  const url = endpoint ?? 'https://api.ringee.io/api/mcp';
  const key = apiKey ?? KEY_PLACEHOLDER;

  const claudeCode = `claude mcp add --transport http ringee ${url} \\\n  --header "Authorization: Bearer ${key}"`;
  const json = JSON.stringify(
    {
      mcpServers: {
        ringee: { url, headers: { Authorization: `Bearer ${key}` } }
      }
    },
    null,
    2
  );
  const env = `export RINGEE_API_KEY=${key}\nringee whoami`;

  return (
    <Tabs defaultValue='claude-code' className='gap-2'>
      <TabsList>
        <TabsTrigger value='claude-code'>Claude Code</TabsTrigger>
        <TabsTrigger value='json'>{t('jsonTab')}</TabsTrigger>
        <TabsTrigger value='env'>{t('envTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value='claude-code'>
        <CodeBlock code={claudeCode} />
      </TabsContent>
      <TabsContent value='json' className='flex flex-col gap-1.5'>
        <CodeBlock code={json} />
        <p className='text-muted-foreground text-xs'>{t('jsonHint')}</p>
      </TabsContent>
      <TabsContent value='env' className='flex flex-col gap-1.5'>
        <CodeBlock code={env} />
        <p className='text-muted-foreground text-xs'>
          {t.rich('envHint', {
            code: (chunks) => <code className='font-mono'>{chunks}</code>
          })}
        </p>
      </TabsContent>
    </Tabs>
  );
}
