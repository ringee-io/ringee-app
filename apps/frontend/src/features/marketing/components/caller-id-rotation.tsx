import {
  Activity,
  ArrowRight,
  Gauge,
  Globe2,
  MapPin,
  PhoneOff,
  PhoneOutgoing,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  Sparkles
} from 'lucide-react';

import {
  Card,
  Container,
  Eyebrow,
  Section,
  SectionHeading
} from './primitives';

/**
 * Caller-ID rotation deep-dive sections, specific to the
 * `/features/caller-id-rotation` page. The generic feature template handles the
 * hero, who-it's-for, 3-step "how it works", related links, and FAQs; these
 * components add the page's distinctive, mechanism-level content so a reader
 * understands exactly how Ringee picks a number and why it raises pickup.
 *
 * Everything here mirrors the real backend behaviour in
 * `CallerIdRotationService` (single `selectForDial` authority, hard
 * country-match guarantee, local-area-code preference, daily caps, health-based
 * ranking, and automatic cooling) — no invented metrics.
 */

/** A single destination → presented-caller-ID row used in the mapping visual. */
function MatchRow({
  region,
  destination,
  callerId
}: {
  region: string;
  destination: string;
  callerId: string;
}) {
  return (
    <div className='border-border/60 bg-background/60 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm'>
      <div className='min-w-0 flex-1'>
        <p className='text-muted-foreground text-xs'>Lead in {region}</p>
        <p className='font-mono font-medium'>{destination}</p>
      </div>
      <ArrowRight
        className='text-muted-foreground h-4 w-4 shrink-0'
        aria-hidden
      />
      <div className='min-w-0 flex-1 text-right'>
        <p className='text-xs text-emerald-600 dark:text-emerald-400'>
          Shows local caller ID
        </p>
        <p className='font-mono font-medium'>{callerId}</p>
      </div>
    </div>
  );
}

/**
 * Value framing: why local presence lifts pickup. Rendered right under the hero
 * so the benefit lands before the mechanics.
 */
export function RotationLocalPresence() {
  return (
    <Section>
      <Container>
        <div className='grid items-center gap-12 lg:grid-cols-2'>
          <div>
            <Eyebrow>Local presence</Eyebrow>
            <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl'>
              People answer a number they recognize
            </h2>
            <p className='text-muted-foreground mt-5 text-lg text-pretty'>
              An unfamiliar — or foreign — number is easy to ignore, and
              carriers are quick to flag a single line that dials a whole region
              as “spam likely.” When the number on the screen shares the
              prospect’s own area code, it reads as local and gets picked up far
              more often.
            </p>
            <p className='text-muted-foreground mt-4 text-pretty'>
              Caller ID rotation presents the right local number for each call,
              automatically, and spreads your dials across a pool so no single
              number gets burned. You keep working your list — Ringee decides
              which number to show.
            </p>
          </div>

          <Card className='bg-muted/20'>
            <p className='text-muted-foreground mb-4 flex items-center gap-2 text-sm font-medium'>
              <Globe2 className='h-4 w-4' aria-hidden />
              One pool, the matching number for every destination
            </p>
            <div className='flex flex-col gap-2.5'>
              <MatchRow
                region='New York'
                destination='+1 (212) 555…'
                callerId='+1 (212) 988…'
              />
              <MatchRow
                region='London'
                destination='+44 20 7946…'
                callerId='+44 20 3514…'
              />
              <MatchRow
                region='Madrid'
                destination='+34 91 123…'
                callerId='+34 91 060…'
              />
            </div>
            <p className='text-muted-foreground mt-4 text-xs'>
              Ringee only ever shows a number you own that matches the
              destination’s country — never a wrong-country line.
            </p>
          </Card>
        </div>
      </Container>
    </Section>
  );
}

/** The ordered selection priority, mirroring `selectForDial`. */
const SELECTION_STEPS: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}[] = [
  {
    icon: ShieldCheck,
    title: 'Country match, guaranteed',
    description:
      'Ringee reads the destination’s country and only ever considers numbers you own in that same country. A prospect never sees a wrong-country caller ID — if Ringee can’t be sure of the country, it leaves your fixed caller ID untouched.'
  },
  {
    icon: MapPin,
    title: 'Local area code first',
    description:
      'On the local-presence strategy, a number sharing the prospect’s exact area code wins. If none is free, Ringee falls back to any number from the same country, so the call still goes out looking local.'
  },
  {
    icon: Gauge,
    title: 'Respect each number’s daily cap',
    description:
      'Every number has a daily call cap (50 by default, adjustable per number). Numbers that already hit their cap for the day are skipped, so dialing volume stays spread out and no single line looks like a robocaller.'
  },
  {
    icon: Activity,
    title: 'Rank by health, then rest',
    description:
      'Among the numbers still eligible, Ringee picks the healthiest one — best recent answer rate — and breaks ties by least-recently-used, so your pool rotates evenly instead of leaning on one favorite.'
  }
];

/**
 * The core mechanism: how Ringee decides which number to present on each call.
 * This is the section that explains "the way we do it."
 */
export function RotationMechanics() {
  return (
    <Section className='bg-muted/20'>
      <Container>
        <SectionHeading
          eyebrow='Under the hood'
          title='How Ringee picks the number to show'
          description='One engine on the backend decides the caller ID for every call — the dialer never guesses. It runs the same priority order whether you dial manually, work a campaign, or share a calling link.'
          align='left'
        />
        <ol className='mt-10 grid gap-5 md:grid-cols-2'>
          {SELECTION_STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className='h-full'>
                <div className='flex items-center gap-3'>
                  <span className='bg-primary text-primary-foreground inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold'>
                    {index + 1}
                  </span>
                  <step.icon className='text-primary h-5 w-5' aria-hidden />
                </div>
                <h3 className='mt-4 text-lg font-semibold'>{step.title}</h3>
                <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                  {step.description}
                </p>
              </Card>
            </li>
          ))}
        </ol>

        <Card className='mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5'>
          <Sparkles
            className='h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400'
            aria-hidden
          />
          <p className='text-muted-foreground text-sm text-pretty'>
            <span className='text-foreground font-medium'>
              Off means nothing changes.
            </span>{' '}
            Rotation is opt-in per workspace. While it’s off — or for any call
            Ringee can’t safely match — you keep the exact fixed caller ID you
            use today, so turning it on is risk-free.
          </p>
        </Card>
      </Container>
    </Section>
  );
}

const HEALTH_POINTS: {
  icon: typeof Gauge;
  title: string;
  description: string;
}[] = [
  {
    icon: Gauge,
    title: 'Daily caps per number',
    description:
      'Cap how many calls each number places per day. It’s the single biggest lever against being flagged — steady, human-looking volume keeps numbers trusted.'
  },
  {
    icon: Activity,
    title: 'A health score on every line',
    description:
      'Ringee scores each number from its recent answer rate and how often calls drop in the first seconds, so weakening numbers surface before they hurt you.'
  },
  {
    icon: Snowflake,
    title: 'Automatic cooling & recovery',
    description:
      'A number whose health dips is pulled out to rest, then quietly returned to rotation once it recovers — no babysitting, no manual list pruning.'
  }
];

const WHERE_IT_WORKS = [
  {
    icon: PhoneOutgoing,
    label: 'Manual dialer',
    detail:
      'Type a number on the web dialer and rotation resolves the caller ID before it rings.'
  },
  {
    icon: RefreshCw,
    label: 'Campaigns',
    detail:
      'Limit a campaign to a chosen set of numbers, or let it draw from the whole pool.'
  },
  {
    icon: Globe2,
    label: 'Calling links',
    detail:
      'Shared call sessions present a matched local number on every dial too.'
  }
];

/**
 * Reputation protection + control + reach. Explains the daily caps / health /
 * cooling loop and where rotation applies — the "value" half of the page.
 */
export function RotationHealth() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow='Deliverability'
          title='Numbers that protect their own reputation'
          description='Pickup only stays high if your numbers stay trusted. Ringee watches each one and keeps the pool healthy on its own, so you’re not the early-warning system.'
          align='left'
        />
        <div className='mt-10 grid gap-5 md:grid-cols-3'>
          {HEALTH_POINTS.map((point) => (
            <Card key={point.title} className='h-full'>
              <point.icon className='text-primary h-6 w-6' aria-hidden />
              <h3 className='mt-4 text-lg font-semibold'>{point.title}</h3>
              <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                {point.description}
              </p>
            </Card>
          ))}
        </div>

        <div className='mt-12 grid gap-10 lg:grid-cols-2'>
          <div>
            <h3 className='text-xl font-bold tracking-tight'>
              You stay in control
            </h3>
            <ul className='mt-5 flex flex-col gap-3'>
              {[
                'Choose a strategy: strict local presence or balanced rotation across the pool.',
                'Set a workspace-wide daily cap and override it on any individual number.',
                'Add or hold back any number from rotation with one toggle.',
                'See per-number calls, answer rate, and health in the rotation report.'
              ].map((item) => (
                <li key={item} className='flex items-start gap-3'>
                  <ShieldCheck
                    className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400'
                    aria-hidden
                  />
                  <span className='text-muted-foreground text-sm'>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className='text-xl font-bold tracking-tight'>
              Works everywhere you dial
            </h3>
            <div className='mt-5 flex flex-col gap-3'>
              {WHERE_IT_WORKS.map((place) => (
                <div
                  key={place.label}
                  className='border-border/60 flex items-start gap-3 rounded-xl border px-4 py-3'
                >
                  <place.icon
                    className='text-primary mt-0.5 h-5 w-5 shrink-0'
                    aria-hidden
                  />
                  <div>
                    <p className='font-medium'>{place.label}</p>
                    <p className='text-muted-foreground text-sm text-pretty'>
                      {place.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className='text-muted-foreground mt-4 flex items-center gap-2 text-xs'>
              <PhoneOff className='h-3.5 w-3.5' aria-hidden />
              When no healthy local number is available, Ringee tells you
              instead of dialing from the wrong one.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
