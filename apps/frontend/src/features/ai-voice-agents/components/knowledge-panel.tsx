'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Globe, Loader2, Trash2, Type, Upload } from 'lucide-react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { useVoiceAgentApi } from '../api';
import type { VoiceAgentKnowledgeSource } from '../types';

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

  const load = useCallback(async () => {
    const list = await api.listKnowledge(agentId).catch(() => []);
    setSources(list);
  }, [api, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const guard = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not add that source'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge</CardTitle>
        <CardDescription>
          What this agent can draw on during a conversation. A source is used
          once it finishes indexing.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='space-y-2'>
          <p className='text-sm font-medium'>Website</p>
          <div className='flex gap-2'>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder='https://company.com/pricing'
            />
            <Button
              variant='outline'
              disabled={busy || !url.trim()}
              onClick={() =>
                guard(async () => {
                  await api.addKnowledgeUrl(agentId, url.trim());
                  setUrl('');
                })
              }
            >
              Add URL
            </Button>
          </div>
        </div>

        <div className='space-y-2'>
          <p className='text-sm font-medium'>Documents</p>
          <input
            ref={fileInput}
            type='file'
            className='hidden'
            accept='.pdf,.txt,.md,.doc,.docx'
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void guard(async () => {
                await api.addKnowledgeDocument(agentId, file);
                if (fileInput.current) fileInput.current.value = '';
              });
            }}
          />
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className='mr-2 size-4' />
            Upload PDF, TXT or DOCX
          </Button>
        </div>

        <div className='space-y-2'>
          <p className='text-sm font-medium'>Text</p>
          <Input
            value={textLabel}
            onChange={(e) => setTextLabel(e.target.value)}
            placeholder='Title, e.g. Refund policy'
          />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder='Anything the agent should know.'
          />
          <div className='flex justify-end'>
            <Button
              variant='outline'
              disabled={busy || !text.trim() || !textLabel.trim()}
              onClick={() =>
                guard(async () => {
                  await api.addKnowledgeText(agentId, textLabel.trim(), text);
                  setTextLabel('');
                  setText('');
                })
              }
            >
              Add text
            </Button>
          </div>
        </div>

        {sources.length > 0 ? (
          <div className='divide-y rounded-md border'>
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
                    variant={
                      source.status === 'ready'
                        ? 'default'
                        : source.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {source.status === 'processing' ? (
                      <Loader2 className='mr-1 size-3 animate-spin' />
                    ) : null}
                    {STATUS_LABEL[source.status]}
                  </Badge>
                  <Button
                    variant='ghost'
                    size='icon'
                    disabled={busy}
                    onClick={() =>
                      guard(() => api.removeKnowledge(agentId, source.id))
                    }
                  >
                    <Trash2 className='size-4' />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
