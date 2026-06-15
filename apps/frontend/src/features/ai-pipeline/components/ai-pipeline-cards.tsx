'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { ArrowRight, Sparkles } from 'lucide-react';

interface PipelineOverview {
  type: string;
  name: string;
  valueProposition: string;
  detailRoute: string;
  implemented: boolean;
  enabledContexts: number;
  totalPendingActions: number;
  totalNewEligible: number;
}

export function AiPipelineCards() {
  const api = useApi();
  const [pipelines, setPipelines] = useState<PipelineOverview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<PipelineOverview[]>('/ai-pipeline');
        setPipelines(data);
      } catch {
        // handled
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-44 w-full' />
        ))}
      </div>
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
      {pipelines.map((p) => (
        <PipelineCard key={p.type} pipeline={p} />
      ))}
    </div>
  );
}

function PipelineCard({ pipeline }: { pipeline: PipelineOverview }) {
  const body = (
    <Card
      className={
        pipeline.implemented
          ? 'hover:border-primary/50 h-full transition-colors'
          : 'h-full opacity-70'
      }
    >
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div className='bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg'>
            <Sparkles className='h-5 w-5' />
          </div>
          {pipeline.implemented ? (
            pipeline.enabledContexts > 0 ? (
              <Badge
                variant='secondary'
                className='bg-green-100 text-green-700'
              >
                {pipeline.enabledContexts} active
              </Badge>
            ) : (
              <Badge variant='outline'>Not enabled</Badge>
            )
          ) : (
            <Badge variant='secondary' className='uppercase'>
              Coming soon
            </Badge>
          )}
        </div>
        <CardTitle className='mt-3'>{pipeline.name}</CardTitle>
        <CardDescription>{pipeline.valueProposition}</CardDescription>
      </CardHeader>
      <CardContent>
        {pipeline.implemented ? (
          <div className='text-muted-foreground flex gap-4 text-sm'>
            <span>
              <span className='text-foreground font-semibold'>
                {pipeline.totalPendingActions}
              </span>{' '}
              pending
            </span>
            <span>
              <span className='text-foreground font-semibold'>
                {pipeline.totalNewEligible}
              </span>{' '}
              new eligible
            </span>
          </div>
        ) : (
          <p className='text-muted-foreground text-sm'>
            This pipeline isn&apos;t available yet.
          </p>
        )}
      </CardContent>
      {pipeline.implemented && (
        <CardFooter>
          <span className='text-primary flex items-center gap-1 text-sm font-medium'>
            Open <ArrowRight className='h-4 w-4' />
          </span>
        </CardFooter>
      )}
    </Card>
  );

  if (!pipeline.implemented) return body;
  return (
    <Link href={pipeline.detailRoute} className='block'>
      {body}
    </Link>
  );
}
