'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Icons } from '@ringee/frontend-shared/components/icons';
import { useIsMobile } from '@ringee/frontend-shared/hooks/use-mobile';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useRotationEnabled } from '../hooks/use-rotation-enabled';

/**
 * Global "Number rotation" entry point in the app header. Shows a small dot
 * reflecting whether rotation is currently on, and routes to the dedicated
 * config screen. Only rendered for workspace admins (gated by the header).
 */
export function NumberRotationHeaderButton() {
  const router = useRouter();
  const mobile = useIsMobile();
  const t = useTranslations('numberRotation');
  const enabled = useRotationEnabled();

  return (
    <Button
      onClick={() => router.push('/dashboard/number-rotation')}
      variant={mobile ? 'ghost' : 'link'}
      size={mobile ? 'icon' : 'sm'}
      className={cn(
        'cursor-pointer',
        mobile ? 'relative h-8 w-8 p-0' : 'gap-1.5'
      )}
      aria-label={t('header.label')}
      title={enabled ? t('header.on') : t('header.off')}
    >
      <span className='relative'>
        <Icons.phoneCall className='h-[15px] w-[15px]' />
        {enabled !== null && (
          <span
            className={cn(
              'absolute -top-1 -right-1 h-2 w-2 rounded-full',
              enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'
            )}
          />
        )}
      </span>
      {!mobile && (
        <span className='text-xs font-semibold'>{t('header.label')}</span>
      )}
    </Button>
  );
}
