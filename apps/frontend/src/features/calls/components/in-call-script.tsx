'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useScriptSync } from '@/features/settings/hooks/use-script-sync';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function InCallScript() {
  const t = useTranslations('calls.inCallScript');
  const { sections, status } = useScriptSync({ readOnly: true });
  const [selectedId, setSelectedId] = useState<string | null>(
    sections[0]?.id ?? null
  );

  useEffect(() => {
    if (selectedId && !sections.find((s) => s.id === selectedId)) {
      setSelectedId(sections[0]?.id ?? null);
      return;
    }
    if (!selectedId && sections[0]) setSelectedId(sections[0].id);
  }, [sections, selectedId]);

  const current = useMemo(
    () => sections.find((s) => s.id === selectedId) ?? null,
    [sections, selectedId]
  );

  if (status === 'idle' || status === 'loading') {
    return (
      <div className='flex h-full w-full'>
        <aside className='border-border/10 w-[140px] shrink-0 border-r p-2 md:w-[180px]'>
          <Skeleton className='mb-2 h-8 w-full' />
          <Skeleton className='mb-2 h-8 w-full' />
          <Skeleton className='h-8 w-full' />
        </aside>
        <div className='flex-1 p-4 md:p-6'>
          <Skeleton className='mb-3 h-5 w-32' />
          <Skeleton className='h-24 w-full' />
        </div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-8 text-center'>
        <div className='bg-muted/30 rounded-xl p-3'>
          <FileText className='text-muted-foreground h-6 w-6' />
        </div>
        <h4 className='text-base font-bold'>{t('empty')}</h4>
        <p className='text-muted-foreground max-w-[260px] text-xs'>
          {t('emptyDescription')}
        </p>
        <Link
          href='/dashboard/settings/overview'
          className='text-xs font-semibold text-emerald-500 hover:underline'
        >
          {t('configure')}
        </Link>
      </div>
    );
  }

  return (
    <div className='flex h-full w-full'>
      <aside className='border-border/10 w-[140px] shrink-0 border-r md:w-[180px]'>
        <ScrollArea className='h-full'>
          <ul className='flex flex-col gap-0.5 p-2'>
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type='button'
                  onClick={() => setSelectedId(section.id)}
                  className={cn(
                    'w-full truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors md:text-sm',
                    selectedId === section.id
                      ? 'bg-foreground/5 text-foreground border-border/30 border'
                      : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground border border-transparent'
                  )}
                  title={section.title}
                >
                  {section.title || t('untitled')}
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>

      <div className='min-w-0 flex-1'>
        <ScrollArea className='h-full'>
          {current ? (
            <div className='flex flex-col gap-3 p-4 md:p-6'>
              <h3 className='text-foreground text-base font-bold md:text-lg'>
                {current.title || t('untitled')}
              </h3>
              <p className='text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap'>
                {current.body || (
                  <span className='text-muted-foreground italic'>
                    {t('noContent')}
                  </span>
                )}
              </p>
            </div>
          ) : null}
        </ScrollArea>
      </div>
    </div>
  );
}
