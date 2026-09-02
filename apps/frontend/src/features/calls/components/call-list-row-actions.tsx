'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, Eye, PhoneCall } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  CallTranscriptionActions,
  TranscriptDialog
} from '@/features/transcription';
import { RecordingPlayButton } from '@/features/recordings/components/recordings.tables/recording-play-button';
import { AudioPlayerModal } from '@/features/recordings/components/audio-player-modal';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';

interface CallListRowActionsProps {
  callId: string;
  recordingUrl?: string | null;
  callFrom?: string;
  callTo?: string;
  phoneNumber?: string;
}

export function CallListRowActions({
  callId,
  recordingUrl,
  callFrom,
  callTo,
  phoneNumber
}: CallListRowActionsProps) {
  const t = useTranslations('common');
  const tHistory = useTranslations('calls.history.table');
  const tRecordings = useTranslations('calls.recordings.table');
  const tPlayer = useTranslations('calls.recordings.player');
  const { handleRecall } = useQuickDialerCall();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);

  return (
    <>
      <TableRowActions label={t('openActions')} menuLabel={t('actions')}>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/call/${callId}`}>
            <Eye className='h-4 w-4' />
            {t('view')}
          </Link>
        </DropdownMenuItem>

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
            <DropdownMenuItem asChild>
              <a href={recordingUrl} download>
                <Download className='h-4 w-4' />
                {tRecordings('downloadRecording')}
              </a>
            </DropdownMenuItem>
          </>
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
          title={tPlayer('callTitle', { from: callFrom, to: callTo })}
        />
      ) : null}
    </>
  );
}
