'use client';

import { useRouter } from 'next/navigation';
import {
  IconShieldCheck,
  IconAlertTriangle,
  IconChevronRight,
  IconCircleCheck
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { RESOURCE_META, TONE_DOT } from '../../lib/node-config';
import { buildHealth } from '../../lib/usage-health';
import { useInfraStore } from '../../store/infra.store';
import type { InfraEdge, InfraNode } from '../../types';
import { Panel, SectionHeader } from './usage-primitives';

/**
 * Operational health — the "what needs attention" panel. Runs the canvas
 * readiness over the overview nodes, groups the incomplete ones, and deep-links
 * each row back to the architecture (selecting the node) so it stays actionable.
 */
export function UsageHealth({
  nodes,
  edges,
  hasOrg
}: {
  nodes: InfraNode[];
  edges: InfraEdge[];
  hasOrg: boolean;
}) {
  const router = useRouter();
  const setFocusNode = useInfraStore((s) => s.setFocusNode);
  const health = buildHealth(nodes, edges, hasOrg);

  const goToNode = (nodeId: string) => {
    setFocusNode(nodeId);
    router.push('/infra/overview');
  };

  const clean = health.attentionCount === 0;

  return (
    <section>
      <SectionHeader
        title='Operational health'
        subtitle={
          clean
            ? 'Everything is ready to make calls'
            : `${health.attentionCount} ${health.attentionCount === 1 ? 'resource needs' : 'resources need'} attention`
        }
        icon={IconShieldCheck}
        right={
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
              clean
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/15 text-amber-400'
            )}
          >
            {clean ? (
              <IconCircleCheck className='size-3.5' />
            ) : (
              <IconAlertTriangle className='size-3.5' />
            )}
            {health.okCount}/{health.total} ready
          </span>
        }
      />

      {clean ? (
        <Panel className='flex items-center gap-3'>
          <span className='flex size-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400'>
            <IconCircleCheck className='size-5' />
          </span>
          <div>
            <p className='text-sm font-medium'>All systems ready</p>
            <p className='text-muted-foreground text-xs'>
              No numbers, campaigns or devices need setup right now.
            </p>
          </div>
        </Panel>
      ) : (
        <div className='grid gap-3 md:grid-cols-2'>
          {health.groups.map((group) => (
            <Panel key={group.key} className='space-y-1'>
              <div className='mb-1.5 flex items-center justify-between'>
                <p className='text-xs font-semibold'>{group.title}</p>
                <span className='text-muted-foreground text-[11px] tabular-nums'>
                  {group.items.length}
                </span>
              </div>
              {group.items.map((item) => {
                const meta = RESOURCE_META[item.type];
                const Icon = meta.Icon;
                return (
                  <button
                    key={item.nodeId}
                    type='button'
                    onClick={() => goToNode(item.nodeId)}
                    className='group hover:bg-accent/40 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors'
                  >
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg',
                        meta.badge
                      )}
                    >
                      <Icon className='size-4' />
                    </span>
                    <div className='min-w-0 flex-1'>
                      <p
                        className='truncate text-xs font-medium'
                        title={item.name}
                      >
                        {item.name}
                      </p>
                      <p className='text-muted-foreground flex items-center gap-1.5 text-[11px]'>
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            TONE_DOT[item.tone]
                          )}
                        />
                        {item.label}
                      </p>
                    </div>
                    <IconChevronRight className='text-muted-foreground/50 group-hover:text-foreground size-4 shrink-0 transition-colors' />
                  </button>
                );
              })}
            </Panel>
          ))}
        </div>
      )}
    </section>
  );
}
