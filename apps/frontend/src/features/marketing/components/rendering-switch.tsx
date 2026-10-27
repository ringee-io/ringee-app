import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * "Human | Machine" — which rendering of the site you are reading.
 *
 * Ringee publishes the same facts twice: the page you are on, written for a
 * person, and `/machine`, which is what an agent gets — a replay of the
 * outbound loop against the surfaces we actually serve, plus the generated
 * claims document behind them. The switch says out loud that both exist, and
 * that they are built from the same objects.
 */

export type Rendering = 'human' | 'machine';

const TABS: { id: Rendering; href: string }[] = [
  { id: 'human', href: '/' },
  { id: 'machine', href: '/machine' }
];

export function RenderingSwitch({
  active,
  className
}: {
  active: Rendering;
  className?: string;
}) {
  const t = useTranslations('marketing.home.rendering');
  return (
    <nav
      aria-label={t('label')}
      className={cn('flex items-start gap-8', className)}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className='group flex flex-col gap-2 transition-transform duration-300 ease-out hover:-translate-y-0.5'
          >
            <span
              className={cn(
                'text-lg font-semibold whitespace-nowrap transition-colors sm:text-xl',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground group-hover:text-foreground'
              )}
            >
              {t(tab.id)}
            </span>
            <span
              aria-hidden
              className={cn(
                'h-[3px] w-full rounded-full transition-colors',
                isActive
                  ? 'bg-emerald-600 dark:bg-emerald-400'
                  : 'bg-transparent'
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
