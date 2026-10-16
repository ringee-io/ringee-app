'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { PlayCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { useState } from 'react';
import { AudioPlayerModal } from '../audio-player-modal';
import { recordingFileName } from '../../lib/recording-file-name';
import { useOnboardingComplete } from '@/features/onboarding/hooks/use.onboarding.complete';
import { useTranslations } from 'next-intl';

interface RecordingPlayButtonProps {
  recordingUrl: string;
  callFrom: string;
  callTo: string;
  /** Download name for the player's own modal; unused with `onPlay`. */
  fileName?: string;
  asMenuItem?: boolean;
  onPlay?: () => void;
}

export function RecordingPlayButton({
  recordingUrl,
  callFrom,
  callTo,
  fileName,
  asMenuItem = false,
  onPlay
}: RecordingPlayButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { completeStep } = useOnboardingComplete();
  const t = useTranslations('calls.recordings.table');
  const tPlayer = useTranslations('calls.recordings.player');

  const handlePlay = () => {
    if (onPlay) {
      onPlay();
    } else {
      setIsModalOpen(true);
    }
    completeStep('recording');
  };

  return (
    <>
      {asMenuItem ? (
        <DropdownMenuItem onClick={handlePlay}>
          <PlayCircle className='h-4 w-4' />
          {t('playRecording')}
        </DropdownMenuItem>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size='sm'
              variant='ghost'
              className='text-emerald-500 hover:text-emerald-400'
              onClick={handlePlay}
            >
              <PlayCircle className='mr-1 h-4 w-4' />
              {t('play')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('playRecording')}</TooltipContent>
        </Tooltip>
      )}

      {!onPlay ? (
        <AudioPlayerModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          audioUrl={recordingUrl}
          fileName={
            fileName ?? recordingFileName({ from: callFrom, to: callTo })
          }
          title={tPlayer('callTitle', { from: callFrom, to: callTo })}
        />
      ) : null}
    </>
  );
}
