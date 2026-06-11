'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@ringee/frontend-shared/components/ui/accordion';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useCustomIntegrationEventSpecs } from '../hooks/use-custom-integrations';
import type { CustomIntegrationEventSpec } from '../types/custom-integrations';

export function CustomIntegrationEventsDocs() {
  const { specs, loading } = useCustomIntegrationEventSpecs();

  if (loading) {
    return (
      <div className='space-y-2'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-10 w-full rounded-md' />
        ))}
      </div>
    );
  }

  const inbound = specs.filter((s) => s.direction === 'inbound');
  const outbound = specs.filter((s) => s.direction === 'outbound');

  return (
    <div className='space-y-6'>
      <Section
        title='Inbound events'
        subtitle='Your system sends these to Ringee.'
        items={inbound}
      />
      <Section
        title='Outbound events'
        subtitle='Ringee sends these to your outbound webhook URL when you subscribe to them.'
        items={outbound}
      />
    </div>
  );
}

function Section({
  title,
  subtitle,
  items
}: {
  title: string;
  subtitle: string;
  items: CustomIntegrationEventSpec[];
}) {
  return (
    <section className='space-y-3'>
      <div>
        <h3 className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
          {title}
        </h3>
        <p className='text-muted-foreground mt-1 text-xs'>{subtitle}</p>
      </div>
      <Accordion type='multiple' className='space-y-2'>
        {items.map((spec) => (
          <AccordionItem
            key={spec.name}
            value={spec.name}
            className='bg-card rounded-md border px-3'
          >
            <AccordionTrigger className='py-2.5 hover:no-underline'>
              <div className='flex items-center gap-3 text-left'>
                <DirectionBadge direction={spec.direction} />
                <code className='text-xs font-semibold'>{spec.name}</code>
                <span className='text-muted-foreground hidden text-xs sm:inline'>
                  {spec.description}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className='pb-4'>
              <EventDetails spec={spec} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function DirectionBadge({ direction }: { direction: 'inbound' | 'outbound' }) {
  if (direction === 'inbound') {
    return (
      <Badge
        variant='outline'
        className='border-sky-500/30 bg-sky-500/10 text-sky-500'
      >
        <ArrowDownLeft className='mr-1 h-3 w-3' /> inbound
      </Badge>
    );
  }
  return (
    <Badge
      variant='outline'
      className='border-violet-500/30 bg-violet-500/10 text-violet-500'
    >
      <ArrowUpRight className='mr-1 h-3 w-3' /> outbound
    </Badge>
  );
}

function EventDetails({ spec }: { spec: CustomIntegrationEventSpec }) {
  return (
    <div className='space-y-4 text-xs'>
      <div>
        <p className='text-sm'>{spec.description}</p>
        <p className='text-muted-foreground mt-1'>{spec.whenItFires}</p>
      </div>

      {spec.requiredFields.length > 0 && (
        <FieldTable title='Required' rows={spec.requiredFields} required />
      )}
      {spec.optionalFields.length > 0 && (
        <FieldTable title='Optional' rows={spec.optionalFields} />
      )}

      <div>
        <h4 className='text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase'>
          Example payload
        </h4>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 font-mono text-[11px] leading-relaxed'>
          {JSON.stringify(spec.examplePayload, null, 2)}
        </pre>
      </div>

      {spec.notes.length > 0 && (
        <div>
          <h4 className='text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase'>
            Notes
          </h4>
          <ul className='text-muted-foreground list-disc space-y-1 pl-4'>
            {spec.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FieldTable({
  title,
  rows,
  required
}: {
  title: string;
  rows: { name: string; type: string; description: string }[];
  required?: boolean;
}) {
  return (
    <div>
      <h4 className='text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase'>
        {title}
      </h4>
      <div className='overflow-hidden rounded-md border'>
        <table className='w-full text-left'>
          <thead className='bg-muted/50'>
            <tr>
              <th className='text-muted-foreground px-3 py-1.5 text-[11px] font-medium'>
                Field
              </th>
              <th className='text-muted-foreground px-3 py-1.5 text-[11px] font-medium'>
                Type
              </th>
              <th className='text-muted-foreground px-3 py-1.5 text-[11px] font-medium'>
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className='border-t'>
                <td className='px-3 py-1.5'>
                  <code className='text-[11px]'>{r.name}</code>
                  {required && (
                    <Badge
                      variant='outline'
                      className='ml-1.5 border-red-500/30 bg-red-500/5 text-[10px] text-red-500'
                    >
                      required
                    </Badge>
                  )}
                </td>
                <td className='text-muted-foreground px-3 py-1.5 text-[11px]'>
                  {r.type}
                </td>
                <td className='px-3 py-1.5 text-[11px]'>{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
