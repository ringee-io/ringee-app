'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTranslations } from 'next-intl';
import { FinalTranscript } from './final-transcript';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null | undefined;
  className?: string;
}

export function TranscriptDialog({
  open,
  onOpenChange,
  callId,
  className
}: Props) {
  const t = useTranslations('transcription');

  if (!callId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-3xl', className)}>
        <DialogHeader>
          <DialogTitle>{t('finalTitle')}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-2">
          <FinalTranscript callId={callId} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}