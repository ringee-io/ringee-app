'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  FileText,
  Globe,
  Loader2,
  Plus,
  Trash2,
  Type,
  Upload
} from 'lucide-react';
import {
  Alert,
  AlertDescription
} from '@ringee/frontend-shared/components/ui/alert';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import type {
  VoiceAgentKnowledgeLibraryEntry,
  VoiceAgentKnowledgeSource
} from '../types';
import { Field, controlClass, textAreaClass } from './fields/field';
import { Section } from './sections/section';

const ICONS = {
  url: Globe,
  text: Type,
  pdf: FileText,
  txt: FileText,
  docx: FileText
} as const;

/** Statuses that mean the provider is still working on the source. */
const INDEXING: ReadonlySet<VoiceAgentKnowledgeSource['status']> = new Set([
  'pending',
  'processing'
]);

/**
 * How often the list is re-read while something is still indexing.
 *
 * This poll is not cosmetic. Reading the list is what makes the server ask the
 * provider whether indexing finished, flip the source to `ready` and re-sync the
 * assistant so the retrieval tool actually points at it. Without it a document
 * finishes indexing and stays unattached until somebody happens to reopen the
 * page — which is exactly what "it never gets assigned" looks like from here.
 */
const POLL_MS = 4000;

/** Per-agent knowledge (§7): add a URL, a document or some text. */
export function KnowledgePanel({
  agentId,
  onSourceReady
}: {
  agentId: string;
  /** A source became usable, so the agent itself was re-synced server-side. */
  onSourceReady?: () => void;
}) {
  const t = useTranslations('aiVoiceAgents.knowledge');
  const api = useVoiceAgentApi();
  const fileInput = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<VoiceAgentKnowledgeSource[]>([]);
  const [url, setUrl] = useState('');
  const [textLabel, setTextLabel] = useState('');
  const [text, setText] = useState('');
  /** Which control is mid-request, so only that one shows a spinner. */
  const [busy, setBusy] = useState<string | null>(null);
  /** The file being sent right now — it has no row of its own yet. */
  const [uploading, setUploading] = useState<string | null>(null);
  /** Which input the last failure belongs to, so it renders under that one. */
  const [error, setError] = useState<{ field: string; message: string } | null>(
    null
  );

  /** Statuses as of the previous read, to notice a source becoming usable. */
  const wasIndexing = useRef<Set<string>>(new Set());
  const notifyReady = useRef(onSourceReady);
  notifyReady.current = onSourceReady;

  const load = useCallback(async () => {
    const list = await api.listKnowledge(agentId).catch(() => null);
    if (!list) return;

    const landed = list.filter(
      (source) =>
        source.status === 'ready' && wasIndexing.current.has(source.id)
    );
    wasIndexing.current = new Set(
      list.filter((source) => INDEXING.has(source.status)).map((s) => s.id)
    );

    setSources(list);

    for (const source of landed) {
      toast.success(t('readyToast', { name: source.label }));
    }
    if (landed.length > 0) notifyReady.current?.();
  }, [api, agentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const indexing = sources.some((source) => INDEXING.has(source.status));

  useEffect(() => {
    if (!indexing) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [indexing, load]);

  const guard = async (field: string, action: () => Promise<unknown>) => {
    setBusy(field);
    setError(null);
    try {
      await action();
      await load();
    } catch (failure) {
      // Adding a source fails for reasons the user can fix — an unreachable
      // page, a file that is too big — so the reason goes next to the input
      // they used, not into a toast that disappears before they read it.
      setError({
        field,
        message: describeApiError(failure, t('addError'))
      });
    } finally {
      setBusy(null);
    }
  };

  const failed = sources.filter((s) => s.status === 'failed' && s.lastError);

  return (
    <div className='space-y-8'>
      <Section
        title={t('title')}
        hint={t('hint')}
        action={
          <ReuseDialog
            agentId={agentId}
            disabled={busy !== null}
            onReused={() => void load()}
          />
        }
      >
        <Field
          label={t('website')}
          htmlFor='knowledge-url'
          error={error?.field === 'url' ? error.message : undefined}
          hint={t('websiteHint')}
        >
          <div className='flex gap-2'>
            <Input
              id='knowledge-url'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('urlPlaceholder')}
              aria-invalid={error?.field === 'url'}
              className={controlClass}
            />
            <Button
              variant='outline'
              className='h-10 shrink-0 rounded-lg'
              disabled={busy !== null || !url.trim()}
              onClick={() =>
                void guard('url', async () => {
                  await api.addKnowledgeUrl(agentId, url.trim());
                  setUrl('');
                  toast.success(t('queuedPage'));
                })
              }
            >
              {busy === 'url' ? (
                <Loader2 className='size-4 animate-spin' />
              ) : null}
              {t('addPage')}
            </Button>
          </div>
        </Field>

        <Field
          label={t('documents')}
          error={error?.field === 'file' ? error.message : undefined}
          hint={t('documentsHint')}
        >
          <input
            ref={fileInput}
            type='file'
            className='hidden'
            accept='.pdf,.txt,.md,.doc,.docx'
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // Named right away: the upload itself can take a while on a big
              // PDF, and until the POST returns there is no row to show.
              setUploading(file.name);
              void guard('file', async () => {
                try {
                  await api.addKnowledgeDocument(agentId, file);
                  if (fileInput.current) fileInput.current.value = '';
                  toast.success(t('queuedDocument'));
                } finally {
                  setUploading(null);
                }
              });
            }}
          />
          <Button
            variant='outline'
            className='h-10 rounded-lg'
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
          >
            {busy === 'file' ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <Upload className='size-4' />
            )}
            {busy === 'file' ? t('uploading') : t('uploadDocument')}
          </Button>
        </Field>

        <Field
          label={t('text')}
          htmlFor='knowledge-text-label'
          error={error?.field === 'text' ? error.message : undefined}
          hint={t('textHint')}
        >
          <div className='space-y-2'>
            <Input
              id='knowledge-text-label'
              value={textLabel}
              onChange={(e) => setTextLabel(e.target.value)}
              placeholder={t('textTitlePlaceholder')}
              maxLength={120}
              aria-invalid={error?.field === 'text'}
              className={controlClass}
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={t('textBodyPlaceholder')}
              className={textAreaClass}
            />
            <div className='flex justify-end'>
              <Button
                variant='outline'
                className='h-10 rounded-lg'
                disabled={busy !== null || !text.trim() || !textLabel.trim()}
                onClick={() =>
                  void guard('text', async () => {
                    await api.addKnowledgeText(agentId, textLabel.trim(), text);
                    setTextLabel('');
                    setText('');
                    toast.success(t('queuedNote'));
                  })
                }
              >
                {busy === 'text' ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : null}
                {t('addTextAction')}
              </Button>
            </div>
          </div>
        </Field>
      </Section>

      {failed.length > 0 ? (
        <Alert variant='destructive' className='rounded-lg'>
          <AlertTriangle className='size-4' />
          <AlertDescription>
            {/* Without this the source just sits at "Failed" with the reason
                stored server-side and never shown. */}
            <ul className='space-y-1'>
              {failed.map((source) => (
                <li key={source.id}>
                  <span className='font-medium'>{source.label}</span> —{' '}
                  {source.lastError}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {sources.length > 0 || uploading ? (
        <div className='divide-y rounded-lg border'>
          {uploading ? (
            <div className='bg-muted/40 flex animate-pulse items-center gap-3 px-3 py-2 text-sm'>
              <Loader2 className='text-muted-foreground size-4 shrink-0 animate-spin' />
              <span className='flex-1 truncate'>{uploading}</span>
              <Badge variant='secondary' className='rounded-lg'>
                {t('uploading')}
              </Badge>
            </div>
          ) : null}

          {sources.map((source) => {
            const Icon = ICONS[source.kind] ?? FileText;
            const working = INDEXING.has(source.status);
            return (
              <div
                key={source.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm',
                  working && 'bg-muted/40'
                )}
              >
                <Icon className='text-muted-foreground size-4 shrink-0' />
                <div className='min-w-0 flex-1'>
                  <p className='truncate'>{source.label}</p>
                  {/* A source that is still indexing is not in the agent's
                      answers yet, and "Queued" alone does not say that. */}
                  {working ? (
                    <p className='text-muted-foreground truncate text-xs'>
                      {t('indexingHint')}
                    </p>
                  ) : null}
                </div>
                <Badge
                  className={cn('rounded-lg', working && 'animate-pulse')}
                  variant={
                    source.status === 'ready'
                      ? 'default'
                      : source.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {working ? <Loader2 className='size-3 animate-spin' /> : null}
                  {t(`status.${source.status}`)}
                </Badge>
                <Button
                  variant='ghost'
                  className='size-10 shrink-0 rounded-lg p-0'
                  aria-label={t('remove', { name: source.label })}
                  disabled={busy !== null}
                  onClick={() =>
                    void guard('list', () =>
                      api.removeKnowledge(agentId, source.id)
                    )
                  }
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className='text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm'>
          {t('empty')}
        </p>
      )}

      {error?.field === 'list' ? (
        <Alert variant='destructive' className='rounded-lg'>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * The workspace's own sources, offered to this agent.
 *
 * Adding one copies it onto this agent rather than sharing it: an agent owns
 * its knowledge store and deleting the agent deletes the store, so a shared
 * reference would let one deletion empty another agent's knowledge.
 */
function ReuseDialog({
  agentId,
  disabled,
  onReused
}: {
  agentId: string;
  disabled: boolean;
  onReused: () => void;
}) {
  const t = useTranslations('aiVoiceAgents.knowledge');
  const api = useVoiceAgentApi();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<VoiceAgentKnowledgeLibraryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        setEntries(await api.listKnowledgeLibrary(agentId));
      } catch (failure) {
        setError(describeApiError(failure, t('libraryError')));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, api, agentId, t]);

  const add = async (entry: VoiceAgentKnowledgeLibraryEntry) => {
    setAdding(entry.id);
    setError(null);
    try {
      await api.reuseKnowledge(agentId, entry.id);
      toast.success(t('reuseSuccess', { name: entry.label }));
      setOpen(false);
      onReused();
    } catch (failure) {
      setError(describeApiError(failure, t('reuseError')));
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='link' className='h-auto p-0' disabled={disabled}>
          {t('reuseLink')}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('reuseTitle')}</DialogTitle>
          <DialogDescription>{t('reuseDescription')}</DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant='destructive' className='rounded-lg'>
            <AlertTriangle className='size-4' />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className='text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm'>
            <Loader2 className='size-4 animate-spin' />
            {t('libraryLoading')}
          </div>
        ) : entries.length === 0 ? (
          <p className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
            {t('reuseEmpty')}
          </p>
        ) : (
          <div className='max-h-80 divide-y overflow-y-auto rounded-lg border'>
            {entries.map((entry) => {
              const Icon = ICONS[entry.kind] ?? FileText;
              return (
                <div
                  key={entry.id}
                  className='flex items-center gap-3 px-3 py-2 text-sm'
                >
                  <Icon className='text-muted-foreground size-4 shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate'>{entry.label}</p>
                    <p className='text-muted-foreground truncate text-xs'>
                      {t('fromAgent', { name: entry.agentName })}
                    </p>
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    className='shrink-0 rounded-lg'
                    disabled={adding !== null || entry.alreadyAdded}
                    onClick={() => void add(entry)}
                  >
                    {adding === entry.id ? (
                      <Loader2 className='size-4 animate-spin' />
                    ) : (
                      <Plus className='size-4' />
                    )}
                    {entry.alreadyAdded ? t('reuseAdded') : t('reuseAdd')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
