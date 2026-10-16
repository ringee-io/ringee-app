'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { downloadRecording } from '@ringee/frontend-shared/lib/crypto';

export interface RecordingDownload {
  /** The stored recording — encrypted, never handed to the browser as is. */
  recordingUrl: string;
  fileName: string;
  /** A Blob URL a player already decrypted, so the file is not fetched twice. */
  decryptedUrl?: string | null;
}

/**
 * Saves a call recording as an mp3. Recordings are stored encrypted, so the
 * file is downloaded and decrypted in the browser first. The toast carries the
 * progress because the row menu a download starts from closes on click.
 */
export function useRecordingDownload() {
  const api = useApi();
  const t = useTranslations('calls.recordings.player');
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(
    async ({ recordingUrl, fileName, decryptedUrl }: RecordingDownload) => {
      const pending = decryptedUrl ? undefined : toast.loading(t('decrypting'));
      setDownloading(true);
      try {
        await downloadRecording(recordingUrl, api, fileName, decryptedUrl);
        if (pending !== undefined) toast.dismiss(pending);
      } catch (error) {
        console.error('Failed to download recording:', error);
        toast.error(t('errorDownload'), { id: pending });
      } finally {
        setDownloading(false);
      }
    },
    [api, t]
  );

  return { download, downloading };
}
