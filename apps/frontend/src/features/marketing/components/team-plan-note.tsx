import { useTranslations } from 'next-intl';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { PRICING } from '../site';

/** Keep the free account CTA distinct from the paid team plan and usage. */
export function TeamPlanNote({
  ai = false,
  className
}: {
  ai?: boolean;
  className?: string;
}) {
  const t = useTranslations('marketing.conversion');

  return (
    <div className={cn('text-center text-xs leading-relaxed', className)}>
      <p className='text-foreground font-medium'>
        {t('teamPlan', { price: PRICING.organization.price })}
      </p>
      <p className='text-muted-foreground mt-1'>
        {t(ai ? 'aiUsage' : 'usage')}
      </p>
    </div>
  );
}
