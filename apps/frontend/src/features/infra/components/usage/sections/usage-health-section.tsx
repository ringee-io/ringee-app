'use client';

import { useRouter } from 'next/navigation';
import {
  IconShieldCheck,
  IconAlertTriangle,
  IconCircleCheck,
  IconArrowRight,
  IconAlertHexagon
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { RESOURCE_META, TONE_DOT } from '../../../lib/node-config';
import type { HealthSummary } from '../../../lib/usage-health';
import { useInfraStore } from '../../../store/infra.store';
import { Panel, SectionIntro } from '../usage-primitives';

/**
 * A compact readiness legend — critical / needs attention / ready. Rendered
 * both in this section's header and, by the shell, in the toolbar (where the
 * filters would otherwise sit) so health always states where things stand.
 */
export function ReadinessPills({ health }: { health: HealthSummary }) {
  const { criticalCount, warnCount, okCount } = health;
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {criticalCount > 0 ? (
        <Pill
          tone='bg-rose-500/15 text-rose-400'
          icon={IconAlertHexagon}
          label={`${criticalCount} critical`}
        />
      ) : null}
      {warnCount > 0 ? (
        <Pill
          tone='bg-amber-500/15 text-amber-400'
          icon={IconAlertTriangle}
          label={`${warnCount} need attention`}
        />
      ) : null}
      <Pill
        tone='bg-emerald-500/15 text-emerald-400'
        icon={IconCircleCheck}
        label={`${okCount} ready`}
      />
    </div>
  );
}

function Pill({
  tone,
  icon: Icon,
  label
}: {
  tone: string;
  icon: typeof IconCircleCheck;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
        tone
      )}
    >
      <Icon className='size-3.5' />
      {label}
    </span>
  );
}

/**
 * Operational health — the actionable "things to fix" view. Runs the exact same
 * readiness logic the canvas uses, groups the incomplete resources by problem,
 * and gives every row a contextual CTA that deep-links back to the architecture
 * (selecting the node) so the fix is one click away.
 */
export function UsageHealthSection({ health }: { health: HealthSummary }) {
  const router = useRouter();
  const setFocusNode = useInfraStore((s) => s.setFocusNode);

  const goToNode = (nodeId: string) => {
    setFocusNode(nodeId);
    router.push('/infra/overview');
  };

  const clean = health.attentionCount === 0;

  return (
    <div>
      <SectionIntro
        title='Operational health'
        description={
          clean
            ? 'Everything is ready to make calls'
            : 'What needs attention before you can call'
        }
        icon={IconShieldCheck}
        right={<ReadinessPills health={health} />}
      />

      {clean ? (
        <Panel className='flex items-center gap-3'>
          <span className='flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400'>
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
        <div className='space-y-3'>
          {health.groups.map((group) => (
            <Panel key={group.key} className='space-y-1'>
              <div className='mb-2 flex items-center justify-between gap-2'>
                <p className='text-sm font-semibold'>{group.title}</p>
                <span className='text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 text-[11px] tabular-nums'>
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
                    className='group hover:bg-accent/40 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors'
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                        meta.badge
                      )}
                    >
                      <Icon className='size-4' />
                    </span>
                    <div className='min-w-0 flex-1'>
                      <p
                        className='truncate text-sm font-medium'
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
                    <span className='text-muted-foreground group-hover:border-foreground/20 group-hover:text-foreground hidden items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:inline-flex'>
                      {group.cta}
                      <IconArrowRight className='size-3.5' />
                    </span>
                  </button>
                );
              })}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
