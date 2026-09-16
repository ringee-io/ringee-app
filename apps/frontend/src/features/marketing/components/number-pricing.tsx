import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clock,
  FileText,
  MapPin,
  Phone
} from 'lucide-react';

import {
  AI_VOICE_AGENT_PRICING,
  capabilityLabel,
  formatMonthly,
  formatPerMinute,
  isAdvanceOrder,
  NUMBER_TYPE_META,
  numberTypeSlug,
  requirementsState,
  type NumberOffer,
  type PhoneNumberCountry
} from '../content/phone-numbers';
import { Card } from './primitives';

/**
 * The building blocks the phone-number pages share. They render prices that
 * were computed server-side and shipped in the generated snapshot — nothing
 * here does pricing arithmetic beyond adding an agent minute to a call minute.
 */

/** Price headline: "$3" over "per month". */
export function PriceTag({
  amount,
  unit,
  className
}: {
  amount: string;
  unit: string;
  className?: string;
}) {
  return (
    <p className={className}>
      <span className='text-3xl font-bold tracking-tight'>{amount}</span>{' '}
      <span className='text-muted-foreground text-sm'>{unit}</span>
    </p>
  );
}

/** One number type of one country, as a card that links to its own page. */
export function NumberTypeCard({
  country,
  offer
}: {
  country: PhoneNumberCountry;
  offer: NumberOffer;
}) {
  const type = numberTypeSlug(offer.numberType);
  const meta = NUMBER_TYPE_META[type];
  const href = `/phone-numbers/${country.slug}/${type}`;
  const onRequest = isAdvanceOrder(offer);

  return (
    <Card className='flex h-full flex-col'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-lg font-semibold'>
            {meta.label} number in {country.countryName}
          </h3>
          <p className='text-muted-foreground mt-1 text-sm'>{meta.tagline}</p>
        </div>
        <span className='text-2xl' aria-hidden>
          {country.flag}
        </span>
      </div>

      {onRequest ? (
        <p className='border-border/70 text-muted-foreground mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium'>
          <Clock className='h-3.5 w-3.5' aria-hidden />
          On request
        </p>
      ) : null}

      <PriceTag
        amount={formatMonthly(offer.monthlyFromUsd)}
        unit='/ month'
        className='mt-5'
      />
      {onRequest ? (
        <p className='text-muted-foreground mt-1 text-xs'>
          {offer.setupUsd
            ? `Plus a ${formatMonthly(offer.setupUsd)} one-time carrier setup fee`
            : 'The carrier lists no one-time setup fee for this type'}
        </p>
      ) : offer.monthlyToUsd > offer.monthlyFromUsd ? (
        <p className='text-muted-foreground mt-1 text-xs'>
          Up to {formatMonthly(offer.monthlyToUsd)}/month depending on the
          number you pick
        </p>
      ) : (
        <p className='text-muted-foreground mt-1 text-xs'>
          No setup fee — cancel any time
        </p>
      )}

      <ul className='mt-5 flex flex-wrap gap-2'>
        {offer.capabilities.map((capability) => (
          <li
            key={capability}
            className='border-border/70 text-muted-foreground rounded-full border px-2.5 py-1 text-xs'
          >
            {capabilityLabel(capability)}
          </li>
        ))}
      </ul>

      <div className='text-muted-foreground mt-5 flex flex-col gap-2 text-sm'>
        {offer.localities.length ? (
          <p className='flex items-start gap-2'>
            <MapPin className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
            <span>{offer.localities.slice(0, 4).join(', ')}</span>
          </p>
        ) : null}
        {onRequest ? (
          <p className='flex items-start gap-2'>
            <Clock className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
            <span>
              Sourced from the carrier to order — not held in inventory
            </span>
          </p>
        ) : null}
        <p className='flex items-start gap-2'>
          <FileText className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
          <span>
            {offer.requirements.length
              ? `${offer.requirements.length} regulatory requirement${
                  offer.requirements.length === 1 ? '' : 's'
                } to activate`
              : requirementsState(offer) === 'unknown'
                ? 'Regulatory requirements confirmed in the dashboard'
                : onRequest
                  ? 'No documents required — the carrier sources the number'
                  : 'No documents required — activate right away'}
          </span>
        </p>
      </div>

      <Link
        href={href}
        className='text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline'
      >
        Requirements and full pricing
        <ArrowRight className='h-4 w-4' aria-hidden />
      </Link>
    </Card>
  );
}

/** The per-minute table: what calling into this country costs. */
export function CallRateTable({ country }: { country: PhoneNumberCountry }) {
  const rate = country.callRate;
  if (!rate) return null;

  const rows = [
    {
      label: `Call ${country.countryName} landlines`,
      from: rate.landlineFromUsd,
      to: rate.landlineToUsd
    },
    {
      label: `Call ${country.countryName} mobiles`,
      from: rate.mobileFromUsd,
      to: rate.mobileToUsd
    }
  ].filter((row) => row.from !== null);

  if (!rows.length) return null;

  return (
    <div className='border-border/70 overflow-x-auto rounded-2xl border'>
      <table className='w-full border-collapse text-left text-sm'>
        <thead>
          <tr className='border-border/70 bg-muted/40 border-b'>
            <th className='p-4 font-semibold'>Destination</th>
            <th className='p-4 font-semibold'>From</th>
            <th className='p-4 font-semibold'>Up to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className='border-border/50 border-b last:border-0'
            >
              <th scope='row' className='text-foreground p-4 font-medium'>
                <span className='flex items-center gap-2'>
                  <Phone className='h-4 w-4 shrink-0' aria-hidden />
                  {row.label}
                </span>
              </th>
              <td className='p-4 font-semibold'>
                {formatPerMinute(row.from as number)}
                <span className='text-muted-foreground font-normal'> /min</span>
              </td>
              <td className='text-muted-foreground p-4'>
                {row.to !== null && row.to !== row.from
                  ? `${formatPerMinute(row.to)} /min`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What an AI voice agent costs into this country. An agent call is two meters:
 * the conversation itself, and the phone call it places.
 */
export function AgentCostBreakdown({
  country
}: {
  country: PhoneNumberCountry;
}) {
  const callFrom = [
    country.callRate?.landlineFromUsd ?? null,
    country.callRate?.mobileFromUsd ?? null
  ].filter((value): value is number => value !== null);

  const cheapestCall = callFrom.length ? Math.min(...callFrom) : null;

  const rows = [
    {
      label: 'Conversation engine',
      detail: 'Speech-to-text, text-to-speech, turn-taking, tools, knowledge',
      amount: AI_VOICE_AGENT_PRICING.enginePerMinuteUsd
    },
    {
      label: 'Ringee AI model',
      detail: 'Included — or bring your own OpenAI, Claude or Gemini key',
      amount: AI_VOICE_AGENT_PRICING.modelPerMinuteUsd
    },
    ...(cheapestCall !== null
      ? [
          {
            label: `The call to ${country.countryName}`,
            detail: 'Same per-minute price a human agent pays, from',
            amount: cheapestCall
          }
        ]
      : [])
  ];

  const total =
    cheapestCall !== null
      ? AI_VOICE_AGENT_PRICING.perMinuteUsd + cheapestCall
      : AI_VOICE_AGENT_PRICING.perMinuteUsd;

  return (
    <Card>
      <ul className='flex flex-col gap-4'>
        {rows.map((row) => (
          <li
            key={row.label}
            className='flex items-start justify-between gap-4'
          >
            <div>
              <p className='font-medium'>{row.label}</p>
              <p className='text-muted-foreground text-sm'>{row.detail}</p>
            </div>
            <p className='shrink-0 font-semibold'>
              {formatPerMinute(row.amount)}
              <span className='text-muted-foreground font-normal'> /min</span>
            </p>
          </li>
        ))}
      </ul>
      <div className='border-border/70 mt-6 flex items-center justify-between gap-4 border-t pt-5'>
        <p className='font-semibold'>
          {cheapestCall !== null
            ? `An agent minute into ${country.countryName}, from`
            : 'An agent minute, before the call itself'}
        </p>
        <p className='text-xl font-bold'>
          {formatPerMinute(total)}
          <span className='text-muted-foreground text-sm font-normal'>
            {' '}
            /min
          </span>
        </p>
      </div>
      <p className='text-muted-foreground mt-3 text-xs'>
        Agent calls need an Organization workspace ($20/month, unlimited users).
        Browser test conversations place no phone call and cost no telephony.
      </p>
    </Card>
  );
}

/** The regulatory checklist for one number type. */
export function RequirementsList({ offer }: { offer: NumberOffer }) {
  if (!offer.requirements.length) {
    const state = requirementsState(offer);

    return (
      <Card className='flex items-start gap-3'>
        {state === 'unknown' ? (
          <FileText className='mt-0.5 h-5 w-5 shrink-0' aria-hidden />
        ) : (
          <Check
            className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400'
            aria-hidden
          />
        )}
        <p className='text-muted-foreground text-sm'>
          {state === 'unknown'
            ? `The regulator's requirements for this number type could not be read from the carrier. Ringee shows what this country asks for when you order the number in the dashboard.`
            : isAdvanceOrder(offer)
              ? 'No regulatory documents are required for this number type. The carrier sources the number to order and confirms it before it activates.'
              : 'No regulatory documents are required for this number type. The number activates as soon as the subscription is confirmed.'}
        </p>
      </Card>
    );
  }

  return (
    <ol className='flex flex-col gap-4'>
      {offer.requirements.map((requirement, index) => (
        <li key={requirement.id}>
          <Card>
            <div className='flex items-start gap-4'>
              <span className='border-border/70 text-muted-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold'>
                {index + 1}
              </span>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h3 className='font-semibold'>{requirement.name}</h3>
                  <span className='bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs capitalize'>
                    {requirement.fieldType}
                  </span>
                </div>
                {requirement.description ? (
                  <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                    {requirement.description}
                  </p>
                ) : null}
                {requirement.example ? (
                  <p className='text-muted-foreground mt-2 text-sm text-pretty italic'>
                    Example: {requirement.example}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}
