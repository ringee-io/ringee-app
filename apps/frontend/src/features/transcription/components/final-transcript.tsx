'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useCallTranscription } from '../hooks/use-call-transcription';
import { speakerLabel } from '../speaker-label';
import { CallTranscriptionView, TranscriptionView } from '../types';

interface Props {
  callId: string | null | undefined;
  className?: string;
}

/** Pick the transcript to display: a completed one wins; otherwise whichever
 *  exists (recording over realtime, since it's the post-call source). */
function pickPrimary(data: CallTranscriptionView | null): TranscriptionView | null {
  if (!data) return null;
  const { realtime, recording } = data;
  if (recording?.status === 'completed') return recording;
  if (realtime?.status === 'completed') return realtime;
  return recording ?? realtime ?? null;
}

export function FinalTranscript({ callId, className }: Props) {
  const t = useTranslations('transcription');
  const {
    data,
    loading,
    actionPending,
    transcribeRecording,
    retry
  } = useCallTranscription(callId);

  if (!callId) return null;

  const primary = pickPrimary(data);
  const recordingAvailable = data?.recordingAvailable ?? false;
  const enabled = data?.transcriptionEnabled ?? true;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          {t('finalTitle')}
        </CardTitle>
        <div className="flex items-center gap-2">
          {primary ? <SourceBadge source={primary.source} t={t} /> : null}
          {primary ? <StatusBadge status={primary.status} t={t} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : primary?.status === 'completed' ? (
          <Transcript transcript={primary} t={t} />
        ) : primary?.status === 'processing' ? (
          <Empty icon="spin" text={t('processing')} />
        ) : primary?.status === 'failed' ? (
          <div className="space-y-3">
            <Empty text={primary.errorMessage || t('status.failed')} />
          </div>
        ) : !enabled ? (
          <Empty text={t('unavailable')} />
        ) : recordingAvailable ? (
          <Empty text={t('readyToTranscribe')} />
        ) : (
          <Empty text={t('unavailable')} />
        )}

        <Actions
          data={data}
          primary={primary}
          recordingAvailable={recordingAvailable}
          enabled={enabled}
          pending={actionPending}
          t={t}
          onTranscribe={() =>
            void run(transcribeRecording, t('errors.transcribeFailed'))
          }
          onRetry={(source) =>
            void run(() => retry(source), t('errors.transcribeFailed'))
          }
        />
      </CardContent>
    </Card>
  );
}

async function run(fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
  } catch {
    toast.error(message);
  }
}

function Transcript({
  transcript,
  t
}: {
  transcript: TranscriptionView;
  t: ReturnType<typeof useTranslations>;
}) {
  if (transcript.segments.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {transcript.text || t('unavailable')}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {transcript.segments.map((s) => (
        <p key={s.id} className="text-sm leading-relaxed">
          <span className="mr-1 font-medium text-muted-foreground">
            {speakerLabel(s.track, s.speaker, t)}:
          </span>
          {s.text}
        </p>
      ))}
    </div>
  );
}

function Actions({
  data,
  primary,
  recordingAvailable,
  enabled,
  pending,
  t,
  onTranscribe,
  onRetry
}: {
  data: CallTranscriptionView | null;
  primary: TranscriptionView | null;
  recordingAvailable: boolean;
  enabled: boolean;
  pending: boolean;
  t: ReturnType<typeof useTranslations>;
  onTranscribe: () => void;
  onRetry: (source: 'realtime' | 'recording') => void;
}) {
  if (!enabled || !data) return null;

  const isCompleted = primary?.status === 'completed';
  const isProcessing = primary?.status === 'processing';
  const isFailed = primary?.status === 'failed';

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {isFailed ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onRetry(primary?.source ?? 'recording')}
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('tryAgain')}
        </Button>
      ) : null}

      {!isCompleted && !isProcessing && recordingAvailable ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onTranscribe}
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('transcribe')}
        </Button>
      ) : null}

      {isCompleted && recordingAvailable ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onTranscribe}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('retranscribe')}
        </Button>
      ) : null}
    </div>
  );
}

function Empty({ text, icon }: { text: string; icon?: 'spin' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
      {icon === 'spin' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {text}
    </div>
  );
}

function SourceBadge({
  source,
  t
}: {
  source: 'realtime' | 'recording';
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Badge variant="outline">
      {source === 'realtime' ? t('sourceRealtime') : t('sourceRecording')}
    </Badge>
  );
}

function StatusBadge({
  status,
  t
}: {
  status: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const variant =
    status === 'completed'
      ? 'secondary'
      : status === 'failed'
        ? 'destructive'
        : 'outline';
  return <Badge variant={variant}>{t(`status.${status}`)}</Badge>;
}
