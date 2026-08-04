import {
  IconCalendarStats,
  IconSpeakerphone,
  IconWaveSine
} from '@tabler/icons-react';
import { GroupLabel, Panel } from '../primitives';
import { HighlightsRow } from '../highlights-row';
import type { JourneyModel } from '../../lib/journey';

/**
 * Activity — what actually happened in the window. Three readings: the headline
 * numbers, where the calls came from (channel adoption), and what they turned
 * into (the outcome mix). Every breakdown is a ranked bar list in one hue with
 * the value written next to it — the bar is for comparison, the number is the
 * fact.
 */
export function ActivitySection({ model }: { model: JourneyModel }) {
  const a = model.activity;
  const hasCalls = a.calls > 0;

  return (
    <div className='space-y-7'>
      <section>
        <GroupLabel>Last {model.windowDays} days</GroupLabel>
        <HighlightsRow highlights={model.highlights} />
      </section>

      <section>
        <GroupLabel>The detail</GroupLabel>
        <Panel>
          <dl className='grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4'>
            <Stat
              label='Connected calls'
              value={a.connectedCalls.toLocaleString('en-US')}
              hint={`of ${a.calls.toLocaleString('en-US')} placed`}
            />
            <Stat
              label='Days with calls'
              value={`${a.activeDays}`}
              hint={`out of ${model.windowDays}`}
            />
            <Stat
              label={model.hasOrg ? 'People calling' : 'Talk time'}
              value={
                model.hasOrg
                  ? `${a.activeCallers}`
                  : `${a.minutes.toLocaleString('en-US')} min`
              }
              hint={model.hasOrg ? 'active in the window' : 'total on calls'}
            />
            <Stat
              label='Previous period'
              value={a.previousCalls.toLocaleString('en-US')}
              hint='calls, 30 days before'
            />
          </dl>
        </Panel>
      </section>

      <div className='grid gap-3 lg:grid-cols-2'>
        <section>
          <GroupLabel>Where calls came from</GroupLabel>
          <Panel>
            {model.channels.length === 0 ? (
              <EmptyNote
                icon={IconWaveSine}
                text='No calls in this window yet — channels show up once you start calling.'
              />
            ) : (
              <ul className='space-y-3'>
                {model.channels.map((channel) => (
                  <li key={channel.id}>
                    <div className='mb-1.5 flex items-baseline gap-2'>
                      <span className='min-w-0 flex-1 truncate text-[13px]'>
                        {channel.label}
                      </span>
                      <span className='shrink-0 text-[13px] font-semibold tabular-nums'>
                        {channel.calls.toLocaleString('en-US')}
                      </span>
                      <span className='text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums'>
                        {channel.share}%
                      </span>
                    </div>
                    <div className='bg-muted h-1.5 w-full overflow-hidden rounded-full'>
                      <div
                        className='bg-primary h-full rounded-full'
                        style={{ width: `${channel.share}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>

        <section>
          <GroupLabel>What they turned into</GroupLabel>
          <Panel>
            {!hasCalls ? (
              <EmptyNote
                icon={IconCalendarStats}
                text='Outcomes appear once calls are dispositioned.'
              />
            ) : (
              <ul className='space-y-3'>
                {model.outcomeMix.map((slice) => {
                  const Icon = slice.Icon;
                  return (
                    <li key={slice.id}>
                      <div className='mb-1.5 flex items-baseline gap-2'>
                        <Icon className='text-muted-foreground/60 size-3.5 shrink-0 self-center' />
                        <span className='min-w-0 flex-1 truncate text-[13px]'>
                          {slice.label}
                        </span>
                        <span className='shrink-0 text-[13px] font-semibold tabular-nums'>
                          {slice.value.toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className='bg-muted h-1.5 w-full overflow-hidden rounded-full'>
                        <div
                          className='h-full rounded-full bg-emerald-500'
                          style={{ width: `${slice.share}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>
      </div>

      {model.campaigns ? (
        <section>
          <GroupLabel>Campaigns</GroupLabel>
          <Panel>
            <dl className='grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4'>
              <Stat
                label='Campaigns'
                value={`${model.campaigns.total}`}
                hint={`${model.campaigns.active} active`}
              />
              <Stat
                label='Leads loaded'
                value={model.campaigns.leads.toLocaleString('en-US')}
                hint='across all campaigns'
              />
              <Stat
                label='Campaign calls'
                value={model.campaigns.callsFromCampaigns.toLocaleString(
                  'en-US'
                )}
                hint={`of ${a.calls.toLocaleString('en-US')} total`}
              />
              <Stat
                label='Share of calling'
                value={
                  a.calls > 0
                    ? `${Math.round(
                        (model.campaigns.callsFromCampaigns / a.calls) * 100
                      )}%`
                    : '—'
                }
                hint='structured outbound'
              />
            </dl>
          </Panel>
        </section>
      ) : (
        <section>
          <GroupLabel>Campaigns</GroupLabel>
          <Panel className='flex items-start gap-3'>
            <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xl'>
              <IconSpeakerphone className='size-5' />
            </span>
            <div className='min-w-0'>
              <p className='text-sm font-medium'>
                Campaigns need an organization
              </p>
              <p className='text-muted-foreground mt-0.5 text-xs leading-relaxed'>
                Your journey is measured on consistency, an integrated stack and
                agents instead — the things that actually compound for a
                one-person operation. Campaigns, shared numbers and team
                reporting unlock when you create an organization.
              </p>
            </div>
          </Panel>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground truncate text-[11px] font-medium'>
        {label}
      </dt>
      <dd className='mt-0.5 text-lg font-semibold tracking-tight tabular-nums'>
        {value}
      </dd>
      {hint ? (
        <p className='text-muted-foreground/70 truncate text-[11px]'>{hint}</p>
      ) : null}
    </div>
  );
}

function EmptyNote({
  icon: Icon,
  text
}: {
  icon: typeof IconWaveSine;
  text: string;
}) {
  return (
    <div className='flex items-center gap-2.5 py-2'>
      <Icon className='text-muted-foreground/50 size-4 shrink-0' />
      <p className='text-muted-foreground text-xs'>{text}</p>
    </div>
  );
}
