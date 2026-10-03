import { cn } from '@ringee/frontend-shared/lib/utils';

/** The dot a disposition is recognised by; a hollow ring when it has no color. */
export function DispositionSwatch({
  color,
  className
}: {
  color: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-3 shrink-0 rounded-full',
        !color && 'border-muted-foreground/50 border',
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
