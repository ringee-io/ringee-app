'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useScriptSync } from '@/features/settings/hooks/use-script-sync';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * The workspace's call script, read-only, one section at a time. Laid out by
 * the room it is given rather than the screen: from a 28rem container the
 * sections are a list beside the text, below that a row of chips above it —
 * a 180px list would leave a narrow column no room for the words.
 */
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

  // The container is a wrapper of its own: an element cannot answer its own
  // container query, so the one that changes direction must sit inside it.
  if (status === 'idle' || status === 'loading') {
    return (
      <div className='@container h-full w-full'>
        <div className='flex h-full flex-col @md:flex-row'>
          <aside className='border-border/10 flex shrink-0 gap-2 border-b p-2 @md:w-[180px] @md:flex-col @md:gap-0 @md:border-r @md:border-b-0'>
            <Skeleton className='h-8 w-24 @md:mb-2 @md:w-full' />
            <Skeleton className='h-8 w-24 @md:mb-2 @md:w-full' />
            <Skeleton className='h-8 w-24 @md:w-full' />
          </aside>
          <div className='flex-1 p-4 @md:p-6'>
            <Skeleton className='mb-3 h-5 w-32' />
            <Skeleton className='h-24 w-full' />
          </div>
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
    <div className='@container h-full w-full'>
      <div className='flex h-full flex-col @md:flex-row'>
        <aside className='border-border/10 shrink-0 border-b @md:w-[180px] @md:border-r @md:border-b-0'>
          <ScrollArea className='@md:h-full'>
            <ul className='flex flex-wrap gap-1 p-2 @md:flex-col @md:flex-nowrap @md:gap-0.5'>
              {sections.map((section) => (
                <li key={section.id} className='max-w-full'>
                  <button
                    type='button'
                    onClick={() => setSelectedId(section.id)}
                    aria-pressed={selectedId === section.id}
                    className={cn(
                      'w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors @md:py-2 @md:text-sm',
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

        <div className='min-h-0 min-w-0 flex-1'>
          <ScrollArea className='h-full'>
            {current ? (
              <div className='flex flex-col gap-3 p-4 @md:p-6'>
                <h3 className='text-foreground text-base font-bold @md:text-lg'>
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
    </div>
  );
}
