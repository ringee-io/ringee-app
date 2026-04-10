'use client';

import { useBreadcrumbs } from '../hooks/use-breadcrumbs';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export function Breadcrumbs() {
  const items = useBreadcrumbs();
  if (items.length === 0) return null;

  // Si estamos en la ruta raíz de una sección, solo mostramos el título actual
  if (items.length === 1) {
    return (
      <span className='text-sm font-medium text-foreground py-1 mt-0.5'>
        {items[0].title}
      </span>
    );
  }

  // Si hay más de un elemento, mostramos el enlace "Back to <Anterior>"
  const previousItem = items[items.length - 2];

  // Regla especial: no mostrar nada si el enlace anterior sería "Dashboard"
  if (previousItem.title === 'Dashboard') return null;

  return (
    <Link
      href={previousItem.link}
      className='flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1 mt-0.5'
    >
      <ArrowLeft className='h-4 w-4' />
      Back to {previousItem.title}
    </Link>
  );
}
