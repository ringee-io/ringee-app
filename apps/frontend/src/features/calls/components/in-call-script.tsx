'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useScriptSync } from '@/features/settings/hooks/use-script-sync';
import { FileText } from 'lucide-react';
import Link from 'next/link';

export function InCallScript() {
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
        <aside className='border-border/10 w-[140px] md:w-[180px] shrink-0 border-r p-2'>
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
        <h4 className='text-base font-bold'>Aún no tienes guion</h4>
        <p className='text-muted-foreground max-w-[260px] text-xs'>
          Crea tu guion en Settings → Overview → Guion para que aparezca aquí
          durante la llamada.
        </p>
        <Link
          href='/dashboard/settings/overview'
          className='text-emerald-500 text-xs font-semibold hover:underline'
        >
          Ir a configurar guion
        </Link>
      </div>
    );
  }

  return (
    <div className='flex h-full w-full'>
      <aside className='border-border/10 w-[140px] md:w-[180px] shrink-0 border-r'>
        <ScrollArea className='h-full'>
          <ul className='flex flex-col gap-0.5 p-2'>
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type='button'
                  onClick={() => setSelectedId(section.id)}
                  className={cn(
                    'w-full truncate rounded-lg px-2.5 py-2 text-left text-xs md:text-sm transition-colors',
                    selectedId === section.id
                      ? 'bg-white/5 text-foreground border border-border/30'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent'
                  )}
                  title={section.title}
                >
                  {section.title || 'Sin título'}
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>

      <div className='flex-1 min-w-0'>
        <ScrollArea className='h-full'>
          {current ? (
            <div className='flex flex-col gap-3 p-4 md:p-6'>
              <h3 className='text-base md:text-lg font-bold text-foreground'>
                {current.title || 'Sin título'}
              </h3>
              <p className='text-foreground/90 whitespace-pre-wrap text-sm leading-relaxed'>
                {current.body || (
                  <span className='text-muted-foreground italic'>
                    (Sin contenido)
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
