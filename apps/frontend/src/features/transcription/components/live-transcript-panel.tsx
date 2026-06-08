'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Loader2, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallTranscription } from '../hooks/use-call-transcription';
import { speakerLabel } from '../speaker-label';

interface Props {
  callId: string | null | undefined;
  className?: string;
}

/**
 * Live Transcript panel for the dialers. Shows accumulated final segments plus
 * the current partial (cleared automatically when a final lands). Polls the
 * backend, which is fed by the Telnyx → Deepgram bridge.
 */
export function LiveTranscriptPanel({ callId, className }: Props) {
  const t = useTranslations('transcription');
  const { data, startRealtime, retry, actionPending } = useCallTranscription(
    callId,
    { live: true }
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  console.log({ data } , "anajaa");
  const realtime = data?.realtime;
  const segments = realtime?.segments ?? [];
  const partial = data?.livePartial;
  const status = realtime?.status;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length, partial?.text]);

  if (!callId) return null;

  return (
    <div className={cn('flex flex-col rounded-lg border bg-card', className)}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('liveTitle')}</span>
        </div>
        <StatusBadge status={status} t={t} />
      </div>

      <ScrollArea className="h-48 px-3 py-2">
        {segments.length === 0 && !partial ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {status === 'failed'
              ? t('status.failed')
              : data && !data.transcriptionEnabled
                ? t('unavailable')
                : t('waitingForAudio')}
          </p>
        ) : (
          <div className="space-y-2">
            {segments.map((s) => (
              <p key={s.id} className="text-sm leading-relaxed">
                <span className="mr-1 font-medium text-muted-foreground">
                  {speakerLabel(s.track, s.speaker, t)}:
                </span>
                {s.text}
              </p>
            ))}
            {partial?.text ? (
              <p className="text-sm italic leading-relaxed text-muted-foreground">
                <span className="mr-1 font-medium">
                  {speakerLabel(partial.track, null, t)}:
                </span>
                {partial.text}
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {status === 'failed' || !status || status === 'idle' || status === 'stopped' ? (
        <div className="border-t px-3 py-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={actionPending || (data && !data.transcriptionEnabled) || false}
            onClick={() =>
              status === 'failed' ? retry('realtime') : startRealtime()
            }
          >
            {actionPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {status === 'failed' ? t('tryAgain') : t('transcribe')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({
  status,
  t
}: {
  status: string | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  if (status === 'transcribing') {
    return (
      <Badge variant="secondary" className="gap-1">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        {t('transcribing')}
      </Badge>
    );
  }
  if (status === 'starting') {
    return <Badge variant="secondary">{t('status.starting')}</Badge>;
  }
  if (status === 'failed') {
    return <Badge variant="destructive">{t('status.failed')}</Badge>;
  }
  if (status === 'completed' || status === 'stopped') {
    return <Badge variant="outline">{t(`status.${status}`)}</Badge>;
  }
  return null;
}
