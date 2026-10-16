'use client';

import { Download, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  useRecordingDownload,
  type RecordingDownload
} from '../hooks/use-recording-download';

interface RecordingDownloadButtonProps extends RecordingDownload {
  /** `menu`: a row-actions item. `icon`: beside an inline player. */
  variant?: 'button' | 'menu' | 'icon';
  className?: string;
}

/** The one "download recording" control, wherever a recording is shown. */
export function RecordingDownloadButton({
  variant = 'button',
  className,
  ...recording
}: RecordingDownloadButtonProps) {
  const t = useTranslations('calls.recordings.table');
  const tCommon = useTranslations('common');
  const { download, downloading } = useRecordingDownload();
  const handleDownload = () => void download(recording);
  const Icon = downloading ? Loader2 : Download;
  const iconClassName = cn('size-3.5', downloading && 'animate-spin');

  if (variant === 'menu') {
    return (
      <DropdownMenuItem onClick={handleDownload}>
        <Download className='h-4 w-4' />
        {t('downloadRecording')}
      </DropdownMenuItem>
    );
  }

  if (variant === 'icon') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className={cn('size-8 shrink-0 rounded-lg', className)}
            onClick={handleDownload}
            disabled={downloading}
            aria-label={t('downloadRecording')}
          >
            <Icon className={iconClassName} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('downloadRecording')}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      className={cn('rounded-lg', className)}
      onClick={handleDownload}
      disabled={downloading}
    >
      <Icon className={iconClassName} />
      {tCommon('download')}
    </Button>
  );
}
