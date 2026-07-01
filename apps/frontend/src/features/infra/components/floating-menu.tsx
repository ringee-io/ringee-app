'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';

export function FloatingMenu({
  x,
  y,
  onClose,
  children
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className='fixed inset-0 z-40'
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className='bg-popover/95 text-popover-foreground fixed z-50 min-w-56 rounded-xl border p-1.5 shadow-xl backdrop-blur-md'
        style={{ left: x, top: y }}
      >
        {children}
      </div>
    </>
  );
}

export function MenuItem({
  onClick,
  danger,
  disabled,
  children
}: {
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors outline-none',
        'hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:text-muted-foreground hover:[&_svg]:text-foreground [&_svg]:shrink-0',
        danger &&
          'text-destructive hover:text-destructive hover:[&_svg]:text-destructive [&_svg]:text-destructive/70'
      )}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className='text-muted-foreground px-2.5 py-1.5 text-[11px] font-medium tracking-wide uppercase'>
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className='bg-border -mx-1 my-1 h-px' />;
}
