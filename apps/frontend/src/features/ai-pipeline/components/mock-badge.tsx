import { FlaskConical } from 'lucide-react';

/**
 * Marker shown on the AI pipeline pages when they are rendering the `?mock=1`
 * demo dataset, so a screenshot is never mistaken for real customer data.
 */
export function MockBadge() {
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700'>
      <FlaskConical className='h-3.5 w-3.5' />
      Datos de prueba
    </span>
  );
}
