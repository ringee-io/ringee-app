import { cn } from '@ringee/frontend-shared/lib/utils';

/** A key, shown next to the control it triggers. */
export function Kbd({
  children,
  onColor = false,
  className
}: {
  children: React.ReactNode;
  /** On a filled button: an outline in the button's own text color. */
  onColor?: boolean;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border px-1.5 font-mono text-[11px] leading-none font-medium',
        onColor
          ? 'border-current/40 opacity-90'
          : 'bg-muted text-muted-foreground border-border',
        className
      )}
    >
      {children}
    </kbd>
  );
}
