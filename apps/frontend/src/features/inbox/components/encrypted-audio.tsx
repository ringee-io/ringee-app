'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { decryptRecordingToBlob } from '@ringee/frontend-shared/lib/crypto';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Loader2, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface EncryptedAudioProps {
  url: string;
  className?: string;
}

/**
 * Native audio player for encrypted recordings. Downloads + decrypts the
 * recording to a Blob URL (same flow as the recordings feature) before
 * handing it to the <audio> element.
 */
export function EncryptedAudio({ url, className }: EncryptedAudioProps) {
  const t = useTranslations('calls.recordings.player');
  const api = useApi();
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      return;
    }

    let blobUrl: string | null = null;

    const loadRecording = async () => {
      setIsLoading(true);
      setError(null);
      setDecryptedUrl(null);

      try {
        blobUrl = await decryptRecordingToBlob(url, api);
        setDecryptedUrl(blobUrl);
      } catch (err) {
        console.error('Failed to decrypt recording:', err);
        setError(t('errorLoad'));
      } finally {
        setIsLoading(false);
      }
    };

    loadRecording();

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [url, api]);

  if (isLoading) {
    return (
      <div
        className={cn(
          'text-muted-foreground mt-2 flex items-center gap-2 text-xs',
          className
        )}
      >
        <Loader2 className='h-3.5 w-3.5 animate-spin' />
        {t('decrypting')}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'text-destructive mt-2 flex items-center gap-2 text-xs',
          className
        )}
      >
        <AlertCircle className='h-3.5 w-3.5' />
        {error}
      </div>
    );
  }

  if (!decryptedUrl) {
    return null;
  }

  return (
    <audio
      controls
      src={decryptedUrl}
      className={cn('mt-2 h-8 w-full', className)}
    />
  );
}
