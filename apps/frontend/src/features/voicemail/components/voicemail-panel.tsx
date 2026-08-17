'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Check,
  Loader2,
  Mic,
  Send,
  Square,
  Trash2,
  Voicemail
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useVoicemailRecorder } from '../hooks/use-voicemail-recorder';
import type { VoicemailAsset, VoicemailTransport } from '../types';

function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  transport: VoicemailTransport;
  /** Shown in the header so the agent can confirm who they are dropping on. */
  destinationLabel?: string;
  onSent: () => void;
  onCancel?: () => void;
  className?: string;
}

/**
 * Pick a greeting from the workspace bucket or record a new one, then send it
 * as a voicemail drop.
 *
 * Two ways out, deliberately: "Save & send" keeps the recording in the bucket
 * under a name and description so the whole team can reuse it, while "Send
 * once" stores it as an unnamed (N/A) asset — the send still needs a stored
 * URL for the provider to fetch, but nobody has to fill in a form to leave a
 * one-off message.
 */
export function VoicemailPanel({
  transport,
  destinationLabel,
  onSent,
  onCancel,
  className
}: Props) {
  const t = useTranslations('voicemail');
  const recorder = useVoicemailRecorder();

  const [assets, setAssets] = useState<VoicemailAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Depends on `transport` alone: pulling the translator in would refetch the
  // bucket on every render if next-intl ever hands back a fresh function.
  const loadFailedRef = useRef(t('loadFailed'));
  loadFailedRef.current = t('loadFailed');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    transport
      .list()
      .then((list) => {
        if (!alive) return;
        setAssets(list);
        // Preselect the workspace default so the common case is one click.
        setSelectedId(
          (current) => current ?? list.find((a) => a.isDefault)?.id ?? null
        );
      })
      .catch(() => alive && setError(loadFailedRef.current))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [transport]);

  /** Uploads the recording and registers it in the bucket. */
  const storeRecording = useCallback(
    async (assetName: string, assetDescription: string) => {
      if (!recorder.recording) return null;
      const { url } = await transport.upload(
        recorder.recording.blob,
        `voicemail.${recorder.recording.extension}`
      );
      return transport.create({
        name: assetName,
        description: assetDescription,
        fileUrl: url,
        durationSec: recorder.recording.durationSec
      });
    },
    [recorder.recording, transport]
  );

  const sendExisting = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await transport.send(selectedId);
      onSent();
    } catch (err) {
      setError((err as Error)?.message || t('sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  const sendRecording = async (keepInBucket: boolean) => {
    if (!recorder.recording) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await storeRecording(
        keepInBucket ? name : '',
        keepInBucket ? description : ''
      );
      if (!asset) return;
      await transport.send(asset.id);
      onSent();
    } catch (err) {
      setError((err as Error)?.message || t('sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  const hasRecording = !!recorder.recording;

  return (
    <div
      className={cn(
        'bg-muted/20 flex flex-col gap-3 rounded-lg border p-3',
        className
      )}
    >
      {/* Heading mirrors the host panels' section headers (icon + `text-sm
          font-medium`, no accent colour) so the panel reads as one more step
          in the wrap-up column rather than a widget dropped into it. */}
      <div className='flex min-w-0 items-center gap-2'>
        <Voicemail className='h-4 w-4 shrink-0' />
        <span className='shrink-0 text-sm font-medium'>{t('title')}</span>
        {destinationLabel && (
          <span className='text-muted-foreground ml-auto min-w-0 truncate text-xs'>
            {destinationLabel}
          </span>
        )}
      </div>

      {/* Reusable bucket */}
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
          {t('bucket')}
        </p>
        {loading ? (
          <div className='text-muted-foreground flex items-center gap-2 py-2 text-xs'>
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
            {t('loading')}
          </div>
        ) : assets.length === 0 ? (
          <p className='text-muted-foreground py-1 text-xs'>{t('empty')}</p>
        ) : (
          <div className='max-h-44 space-y-1.5 overflow-y-auto pr-1'>
            {assets.map((asset) => {
              const isSelected = selectedId === asset.id;
              return (
                <div
                  key={asset.id}
                  className={cn(
                    'rounded-lg border px-3 py-2 transition-colors',
                    // Theme accent, not a hardcoded hue: selection has to read
                    // the same as a selected disposition in the host panel.
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border/60 bg-card hover:bg-muted/40'
                  )}
                >
                  {/* The audio player needs its own click target, so only the
                      label row toggles selection. */}
                  <button
                    type='button'
                    onClick={() => setSelectedId(isSelected ? null : asset.id)}
                    className='w-full text-left'
                  >
                    <div className='flex min-w-0 items-center gap-2'>
                      <span className='min-w-0 truncate text-sm font-medium'>
                        {asset.name}
                      </span>
                      {asset.isDefault && (
                        <Badge
                          variant='secondary'
                          className='shrink-0 px-1.5 py-0'
                        >
                          {t('default')}
                        </Badge>
                      )}
                      {asset.durationSec != null && (
                        <span className='text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums'>
                          {formatSeconds(asset.durationSec)}
                        </span>
                      )}
                      {isSelected && (
                        <Check className='text-primary h-3.5 w-3.5 shrink-0' />
                      )}
                    </div>
                    {asset.description && (
                      <p className='text-muted-foreground mt-0.5 truncate text-xs'>
                        {asset.description}
                      </p>
                    )}
                  </button>
                  <audio
                    src={asset.fileUrl}
                    controls
                    preload='none'
                    className='mt-1.5 h-7 w-full min-w-0'
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* Record a new one */}
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
          {t('recordNew')}
        </p>

        {recorder.state === 'denied' && (
          <p className='text-xs text-amber-600'>{t('micDenied')}</p>
        )}
        {recorder.state === 'failed' && (
          <p className='text-xs text-red-600'>{t('encodeFailed')}</p>
        )}

        {!hasRecording ? (
          <Button
            type='button'
            variant={recorder.state === 'recording' ? 'destructive' : 'outline'}
            size='sm'
            onClick={() =>
              recorder.state === 'recording'
                ? recorder.stop()
                : void recorder.start()
            }
            disabled={busy || recorder.state === 'encoding'}
          >
            {recorder.state === 'recording' ? (
              <>
                <Square className='mr-1.5 h-3.5 w-3.5' />
                {t('stopAt', { time: formatSeconds(recorder.seconds) })}
              </>
            ) : recorder.state === 'encoding' ? (
              <>
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                {t('encoding')}
              </>
            ) : (
              <>
                <Mic className='mr-1.5 h-3.5 w-3.5' />
                {t('startRecording')}
              </>
            )}
          </Button>
        ) : (
          <div className='space-y-2'>
            <div className='flex items-center gap-2'>
              {/* `min-w-0`: a native <audio> has an intrinsic minimum width
                  and would otherwise refuse to shrink, overflowing the
                  column on narrow screens. */}
              <audio
                src={recorder.recording!.url}
                controls
                className='h-8 min-w-0 flex-1'
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='shrink-0'
                onClick={recorder.discard}
                disabled={busy}
                title={t('discard')}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>

            <div className='space-y-1'>
              <Label htmlFor='vm-name' className='text-xs'>
                {t('name')}
              </Label>
              <Input
                id='vm-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                disabled={busy}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='vm-description' className='text-xs'>
                {t('description')}
              </Label>
              <Textarea
                id='vm-description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                rows={2}
                disabled={busy}
              />
            </div>
          </div>
        )}
      </div>

      {error && <p className='text-xs text-red-600'>{error}</p>}

      {/* Two send buttons plus Cancel do not fit side by side in the narrow
          wrap-up column (or the inbox composer on a phone), so they stack
          until there is room. */}
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:items-center'>
        {onCancel && (
          <button
            type='button'
            onClick={onCancel}
            disabled={busy}
            className='text-muted-foreground hover:text-foreground shrink-0 text-xs transition-colors'
          >
            {t('cancel')}
          </button>
        )}
        {hasRecording ? (
          <>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='w-full sm:flex-1'
              onClick={() => void sendRecording(false)}
              disabled={busy}
            >
              {t('sendOnce')}
            </Button>
            <Button
              type='button'
              size='sm'
              className='w-full sm:flex-1'
              onClick={() => void sendRecording(true)}
              disabled={busy || !name.trim()}
            >
              {busy ? (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Send className='mr-1.5 h-3.5 w-3.5' />
              )}
              {t('saveAndSend')}
            </Button>
          </>
        ) : (
          <Button
            type='button'
            size='sm'
            className='w-full sm:flex-1'
            onClick={() => void sendExisting()}
            disabled={busy || !selectedId}
          >
            {busy ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <Send className='mr-1.5 h-3.5 w-3.5' />
            )}
            {t('send')}
          </Button>
        )}
      </div>
    </div>
  );
}
