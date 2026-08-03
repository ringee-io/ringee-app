import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * Static, server-rendered code sample for developer-facing marketing pages.
 *
 * Deliberately unhighlighted: the snippet ships in the initial HTML (crawlers
 * and AI engines read it as plain text) and costs no client JavaScript. The
 * surface is dark in both themes, the way a terminal or editor pane reads on a
 * light page.
 */
export function CodeBlock({
  code,
  label,
  language,
  className
}: {
  code: string;
  /** Filename or short caption shown in the header bar. */
  label?: string;
  /** Language tag shown on the right of the header bar. */
  language?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // `min-w-0` lets the block shrink inside grid/flex tracks — without it
        // a long code line widens the whole page instead of scrolling itself.
        'w-full min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-sm',
        className
      )}
    >
      {label || language ? (
        <div className='flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-2.5'>
          <span className='font-mono text-xs text-slate-400'>{label}</span>
          {language ? (
            <span className='text-[10px] font-semibold tracking-wide text-slate-500 uppercase'>
              {language}
            </span>
          ) : null}
        </div>
      ) : null}
      <pre className='overflow-x-auto px-4 py-4 text-[13px] leading-relaxed text-slate-100'>
        <code className='font-mono'>{code}</code>
      </pre>
    </div>
  );
}
