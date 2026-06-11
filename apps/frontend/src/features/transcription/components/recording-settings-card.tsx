'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRecordingSettings } from '../hooks/use-recording-settings';
import { RecordingSettings } from '../types';

/**
 * "Call Recording & Transcription Settings" card. Edits the settings for the
 * active context (personal or organization — resolved server-side). Org
 * settings can only be changed by org admins; a rejected save rolls back and
 * shows a toast.
 */
export function RecordingSettingsCard({ className }: { className?: string }) {
  const t = useTranslations('transcription');
  const { settings, loading, saving, update } = useRecordingSettings();

  const onToggle = async (key: keyof RecordingSettings, value: boolean) => {
    try {
      await update({ [key]: value });
    } catch {
      toast.error(t('settings.saveError'));
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('settings.title')}</CardTitle>
        <CardDescription>{t('settings.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-1'>
        {loading ? (
          <div className='space-y-4'>
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
          </div>
        ) : (
          <>
            <Row
              title={t('settings.recordAll')}
              description={t('settings.recordAllDesc')}
              checked={settings.recordAllCalls}
              disabled={saving}
              onCheckedChange={(v) => onToggle('recordAllCalls', v)}
            />
            <Row
              title={t('settings.transcribeRealtime')}
              description={t('settings.transcribeRealtimeDesc')}
              checked={settings.transcribeRealtime}
              disabled={saving}
              onCheckedChange={(v) => onToggle('transcribeRealtime', v)}
            />
            <Row
              title={t('settings.transcribeRecordings')}
              description={t('settings.transcribeRecordingsDesc')}
              checked={settings.transcribeRecordings}
              disabled={saving}
              onCheckedChange={(v) => onToggle('transcribeRecordings', v)}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  title,
  description,
  checked,
  disabled,
  onCheckedChange
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className='flex items-center justify-between gap-4 border-b py-4 last:border-b-0'>
      <div className='space-y-0.5'>
        <p className='text-sm font-medium'>{title}</p>
        <p className='text-muted-foreground text-sm'>{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
