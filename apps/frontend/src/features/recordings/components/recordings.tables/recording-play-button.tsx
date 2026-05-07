'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { PlayCircle } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { useState } from 'react';
import { AudioPlayerModal } from '../audio-player-modal';
import { useOnboardingComplete } from '@/features/onboarding/hooks/use.onboarding.complete';
import { useTranslations } from 'next-intl';

interface RecordingPlayButtonProps {
    recordingUrl: string;
    callFrom: string;
    callTo: string;
}

export function RecordingPlayButton({
    recordingUrl,
    callFrom,
    callTo
}: RecordingPlayButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { completeStep } = useOnboardingComplete();
    const t = useTranslations('calls.recordings.table');
    const tPlayer = useTranslations('calls.recordings.player');

    const handlePlay = () => {
        setIsModalOpen(true);
        completeStep('recording');
    };

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-500 hover:text-emerald-400"
                        onClick={handlePlay}
                    >
                        <PlayCircle className="mr-1 h-4 w-4" />
                        {t('play')}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{t('playRecording')}</TooltipContent>
            </Tooltip>

            <AudioPlayerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                audioUrl={recordingUrl}
                title={tPlayer('callTitle', { from: callFrom, to: callTo })}
            />
        </>
    );
}
