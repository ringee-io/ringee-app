'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { PlayCircle, AlertCircle } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { useState, useEffect } from 'react';
import { AudioPlayerModal } from '../audio-player-modal';

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

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-500 hover:text-emerald-400"
                        onClick={() => setIsModalOpen(true)}
                    >
                        <PlayCircle className="mr-1 h-4 w-4" />
                        Play
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Play recording</TooltipContent>
            </Tooltip>

            <AudioPlayerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                audioUrl={recordingUrl}
                title={`Call: ${callFrom} → ${callTo}`}
            />
        </>
    );
}
