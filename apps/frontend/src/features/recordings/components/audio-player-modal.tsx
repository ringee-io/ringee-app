'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { useEffect, useState } from 'react';
import { decryptRecordingToBlob } from '@ringee/frontend-shared/lib/crypto';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Loader2, AlertCircle } from 'lucide-react';

interface AudioPlayerModalProps {
    isOpen: boolean;
    onClose: () => void;
    audioUrl: string;
    title?: string;
}

export function AudioPlayerModal({
    isOpen,
    onClose,
    audioUrl,
    title = 'Call Recording'
}: AudioPlayerModalProps) {
    const api = useApi();
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !audioUrl) {
            return;
        }

        let blobUrl: string | null = null;

        const loadRecording = async () => {
            setIsLoading(true);
            setError(null);
            setDecryptedUrl(null);

            try {
                blobUrl = await decryptRecordingToBlob(audioUrl, api);
                setDecryptedUrl(blobUrl);
            } catch (err) {
                console.error('Failed to decrypt recording:', err);
                setError('Failed to load recording. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };

        loadRecording();

        // Cleanup: revoke blob URL when modal closes
        return () => {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [isOpen, audioUrl, api]);

    const handleClose = () => {
        // Revoke current blob URL
        if (decryptedUrl) {
            URL.revokeObjectURL(decryptedUrl);
            setDecryptedUrl(null);
        }
        setError(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                            <p className="mt-2 text-sm text-muted-foreground">
                                Decrypting recording...
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="flex flex-col items-center justify-center py-8 text-destructive">
                            <AlertCircle className="h-8 w-8" />
                            <p className="mt-2 text-sm">{error}</p>
                        </div>
                    )}

                    {decryptedUrl && !isLoading && !error && (
                        <AudioPlayer
                            autoPlay
                            src={decryptedUrl}
                            showJumpControls={false}
                            customAdditionalControls={[]}
                            layout="stacked-reverse"
                            className="rounded-lg"
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
