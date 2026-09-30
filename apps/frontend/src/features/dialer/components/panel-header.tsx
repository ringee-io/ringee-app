'use client';

import type { LucideIcon } from 'lucide-react';

/** The strip across the top of a workspace column. */
export const PANEL_HEADER_CLASS =
  'bg-background flex h-10 w-full shrink-0 items-stretch justify-start gap-5 rounded-none border-b px-4 py-0';

/**
 * A column's tab, as the script column renders its own. Overrides the shared
 * trigger's pill look — dark mode included — for an underline.
 */
export const PANEL_TAB_CLASS =
  'text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:border-primary dark:data-[state=active]:border-primary h-10 flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent';

/**
 * Names a workspace column — Lead, Outcome — in the same underline the script
 * column uses for its tabs, so the three read as one row of labelled panels
 * under the call bar.
 */
export function PanelHeader({
  icon: Icon,
  title
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className={PANEL_HEADER_CLASS}>
      <h2 className='border-primary text-foreground inline-flex h-10 items-center gap-1.5 border-b-2 text-sm font-medium'>
        <Icon className='h-3.5 w-3.5' />
        {title}
      </h2>
    </div>
  );
}
