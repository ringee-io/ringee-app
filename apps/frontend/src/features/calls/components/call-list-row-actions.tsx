'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, PhoneCall } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import { CopyIdMenuItem } from '@ringee/frontend-shared/components/ui/copy-id-menu-item';
import {
  CallTranscriptionActions,
  TranscriptDialog
} from '@/features/transcription';
import { RecordingPlayButton } from '@/features/recordings/components/recordings.tables/recording-play-button';
import { RecordingDownloadButton } from '@/features/recordings/components/recording-download-button';
import { AudioPlayerModal } from '@/features/recordings/components/audio-player-modal';
import { recordingFileName } from '@/features/recordings/lib/recording-file-name';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';

interface CallListRowActionsProps {
  callId: string;
  /** Recording attached to the row. Set it where the row *is* a recording. */
  recordingId?: string | null;
  recordingUrl?: string | null;
  callFrom?: string;
  callTo?: string;
  /** When the call started; dates the downloaded recording's file name. */
  startedAt?: string | null;
  phoneNumber?: string;
  onView?: () => void;
}

export function CallListRowActions({
  callId,
  recordingId,
  recordingUrl,
  callFrom,
  callTo,
  startedAt,
  phoneNumber,
  onView
}: CallListRowActionsProps) {
  const t = useTranslations('common');
  const tHistory = useTranslations('calls.history.table');
  const tRecordings = useTranslations('calls.recordings.table');
  const tPlayer = useTranslations('calls.recordings.player');
  const { handleRecall } = useQuickDialerCall();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const recordingName = recordingFileName({
    from: callFrom,
    to: callTo,
    at: startedAt,
    callId
  });

  return (
    <>
      <TableRowActions label={t('openActions')} menuLabel={t('actions')}>
        {onView ? (
          <DropdownMenuItem onClick={onView}>
            <Eye className='h-4 w-4' />
            {t('view')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/call/${callId}`}>
              <Eye className='h-4 w-4' />
              {t('view')}
            </Link>
          </DropdownMenuItem>
        )}

        {phoneNumber ? (
          <DropdownMenuItem onClick={() => handleRecall(phoneNumber)}>
            <PhoneCall className='h-4 w-4' />
            {tHistory('callAgain')}
          </DropdownMenuItem>
        ) : null}

        <CallTranscriptionActions
          callId={callId}
          asMenuItem
          onView={() => setTranscriptOpen(true)}
        />

        {recordingUrl && callFrom && callTo ? (
          <>
            <DropdownMenuSeparator />
            <RecordingPlayButton
              recordingUrl={recordingUrl}
              callFrom={callFrom}
              callTo={callTo}
              asMenuItem
              onPlay={() => setPlayerOpen(true)}
            />
            <RecordingDownloadButton
              variant='menu'
              recordingUrl={recordingUrl}
              fileName={recordingName}
            />
          </>
        ) : null}

        <DropdownMenuSeparator />
        <CopyIdMenuItem id={callId} label={tHistory('copyCallId')} />
        {recordingId ? (
          <CopyIdMenuItem
            id={recordingId}
            label={tRecordings('copyRecordingId')}
          />
        ) : null}
      </TableRowActions>

      <TranscriptDialog
        open={transcriptOpen}
        onOpenChange={setTranscriptOpen}
        callId={callId}
      />

      {recordingUrl && callFrom && callTo ? (
        <AudioPlayerModal
          isOpen={playerOpen}
          onClose={() => setPlayerOpen(false)}
          audioUrl={recordingUrl}
          fileName={recordingName}
          title={tPlayer('callTitle', { from: callFrom, to: callTo })}
        />
      ) : null}
    </>
  );
}
