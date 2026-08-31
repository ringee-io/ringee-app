'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  FileText,
  Globe,
  Loader2,
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
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import type { VoiceAgentKnowledgeSource } from '../types';
import { Field, controlClass, textAreaClass } from './fields/field';
import { Section } from './sections/section';

const STATUS_LABEL: Record<VoiceAgentKnowledgeSource['status'], string> = {
  pending: 'Queued',
  processing: 'Indexing',
  ready: 'Ready',
  failed: 'Failed'
};

const ICONS = {
  url: Globe,
  text: Type,
  pdf: FileText,
  txt: FileText,
  docx: FileText
} as const;

/** Per-agent knowledge (§7): add a URL, a document or some text. */
export function KnowledgePanel({ agentId }: { agentId: string }) {
  const api = useVoiceAgentApi();
  const fileInput = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<VoiceAgentKnowledgeSource[]>([]);
  const [url, setUrl] = useState('');
  const [textLabel, setTextLabel] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  /** Which input the last failure belongs to, so it renders under that one. */
  const [error, setError] = useState<{ field: string; message: string } | null>(
    null
  );

  const load = useCallback(async () => {
    const list = await api.listKnowledge(agentId).catch(() => []);
    setSources(list);
  }, [api, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const guard = async (field: string, action: () => Promise<unknown>) => {
    setBusy(true);
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
        message: describeApiError(failure, 'Could not add that source.')
      });
    } finally {
      setBusy(false);
    }
  };

  const failed = sources.filter((s) => s.status === 'failed' && s.lastError);

  return (
    <div className='space-y-8'>
      <Section
        title='Knowledge'
        hint='What this agent can draw on during a conversation. A source is used once it finishes indexing.'
      >
        <Field
          label='Website'
          htmlFor='knowledge-url'
          error={error?.field === 'url' ? error.message : undefined}
          hint='One page at a time — a pricing page, a FAQ, a policy.'
        >
          <div className='flex gap-2'>
            <Input
              id='knowledge-url'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder='https://company.com/pricing'
              aria-invalid={error?.field === 'url'}
              className={controlClass}
            />
            <Button
              variant='outline'
              className='h-10 shrink-0 rounded-lg'
              disabled={busy || !url.trim()}
              onClick={() =>
                void guard('url', async () => {
                  await api.addKnowledgeUrl(agentId, url.trim());
                  setUrl('');
                  toast.success('Page queued for indexing');
                })
              }
            >
              Add page
            </Button>
          </div>
        </Field>

        <Field
          label='Documents'
          error={error?.field === 'file' ? error.message : undefined}
          hint='PDF, TXT or DOCX.'
        >
          <input
            ref={fileInput}
            type='file'
            className='hidden'
            accept='.pdf,.txt,.md,.doc,.docx'
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void guard('file', async () => {
                await api.addKnowledgeDocument(agentId, file);
                if (fileInput.current) fileInput.current.value = '';
                toast.success('Document queued for indexing');
              });
            }}
          />
          <Button
            variant='outline'
            className='h-10 rounded-lg'
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className='size-4' />
            Upload a document
          </Button>
        </Field>

        <Field
          label='Text'
          htmlFor='knowledge-text-label'
          error={error?.field === 'text' ? error.message : undefined}
          hint='Anything that is not written down anywhere else.'
        >
          <div className='space-y-2'>
            <Input
              id='knowledge-text-label'
              value={textLabel}
              onChange={(e) => setTextLabel(e.target.value)}
              placeholder='Title, e.g. Refund policy'
              maxLength={120}
              aria-invalid={error?.field === 'text'}
              className={controlClass}
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder='Anything the agent should know.'
              className={textAreaClass}
            />
            <div className='flex justify-end'>
              <Button
                variant='outline'
                className='h-10 rounded-lg'
                disabled={busy || !text.trim() || !textLabel.trim()}
                onClick={() =>
                  void guard('text', async () => {
                    await api.addKnowledgeText(agentId, textLabel.trim(), text);
                    setTextLabel('');
                    setText('');
                    toast.success('Note queued for indexing');
                  })
                }
              >
                Add text
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

      {sources.length > 0 ? (
        <div className='divide-y rounded-lg border'>
          {sources.map((source) => {
            const Icon = ICONS[source.kind] ?? FileText;
            return (
              <div
                key={source.id}
                className='flex items-center gap-3 px-3 py-2 text-sm'
              >
                <Icon className='text-muted-foreground size-4 shrink-0' />
                <span className='flex-1 truncate'>{source.label}</span>
                <Badge
                  className='rounded-lg'
                  variant={
                    source.status === 'ready'
                      ? 'default'
                      : source.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {source.status === 'processing' ? (
                    <Loader2 className='size-3 animate-spin' />
                  ) : null}
                  {STATUS_LABEL[source.status]}
                </Badge>
                <Button
                  variant='ghost'
                  className='size-10 shrink-0 rounded-lg p-0'
                  aria-label={`Remove ${source.label}`}
                  disabled={busy}
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
          No sources yet. The agent still works — it just answers from its
          instructions and the company context.
        </p>
      )}

      {error?.field === 'list' ? (
        <Alert variant='destructive' className='rounded-lg'>
          <AlertTriangle className='size-4' />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
