import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, Clock, Info } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection } from '@/features/marketing/components/faq';
import { HowItWorksSteps } from '@/features/marketing/components/detail';
import { JsonLd, productJsonLd } from '@/features/marketing/components/json-ld';
import {
  Card,
  Container,
  CtaButtons,
  Eyebrow,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import {
  AgentCostBreakdown,
  CallRateTable,
  NumberTypeCard
} from '@/features/marketing/components/number-pricing';
import {
  ADVANCE_ORDER_NOTE,
  AI_VOICE_AGENT_PRICING,
  formatMonthly,
  formatPerMinute,
  getPhoneNumberCountry,
  isAdvanceOrder,
  NUMBER_TYPE_META,
  numberTypeSlug,
  PHONE_NUMBER_COUNTRIES,
  PRICING_GENERATED_AT,
  type PhoneNumberCountry
} from '@/features/marketing/content/phone-numbers';
import { SITE_URL } from '@/features/marketing/site';

type Params = { params: Promise<{ country: string }> };

export function generateStaticParams() {
  return PHONE_NUMBER_COUNTRIES.map((country) => ({ country: country.slug }));
}

/** The types this country sells, spelled the way the copy reads them. */
function typeLabels(country: PhoneNumberCountry): string[] {
  return country.offers.map(
    (offer) => NUMBER_TYPE_META[numberTypeSlug(offer.numberType)].label
  );
}

function cheapestCallRate(country: PhoneNumberCountry): number | null {
  const rates = [
    country.callRate?.landlineFromUsd ?? null,
    country.callRate?.mobileFromUsd ?? null
  ].filter((rate): rate is number => rate !== null);

  return rates.length ? Math.min(...rates) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { country: slug } = await params;
  const country = getPhoneNumberCountry(slug);
  if (!country) return {};

  const from = formatMonthly(country.fromMonthlyUsd);
  const callFrom = cheapestCallRate(country);

  return buildMetadata({
    title: `${country.countryName} Phone Numbers — Pricing & Requirements | Ringee`,
    description: `Buy a ${typeLabels(country)
      .join(', ')
      .toLowerCase()} phone number in ${country.countryName} from ${from}/month. See the regulatory documents required, per-minute call rates${
      callFrom ? ` from ${formatPerMinute(callFrom)}/min` : ''
    }, and what an AI voice agent costs per minute.`,
    path: `/phone-numbers/${country.slug}`
  });
}

export default async function CountryPhoneNumbersPage({ params }: Params) {
  const { country: slug } = await params;
  const country = getPhoneNumberCountry(slug);
  if (!country) notFound();

  const path = `/phone-numbers/${country.slug}`;
  const from = formatMonthly(country.fromMonthlyUsd);
  const callFrom = cheapestCallRate(country);
  const documented = country.offers.filter(
    (offer) => offer.requirements.length > 0
  );
  const inStock = country.offers.filter((offer) => !isAdvanceOrder(offer));
  const onRequest = country.offers.filter(isAdvanceOrder);
  const typeLabel = (offer: (typeof country.offers)[number]) =>
    NUMBER_TYPE_META[numberTypeSlug(offer.numberType)].label;
  const related = PHONE_NUMBER_COUNTRIES.filter(
    (other) =>
      other.countryCode !== country.countryCode &&
      other.region === country.region
  ).slice(0, 6);

  const generatedAt = new Date(PRICING_GENERATED_AT).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const faqs = [
    {
      question: `How much does a ${country.countryName} phone number cost?`,
      answer: `A ${country.countryName} number starts at ${from} per month, billed as a monthly subscription.${
        inStock.length
          ? ` ${inStock
              .map(
                (offer) =>
                  `${typeLabel(offer)} numbers are ${formatMonthly(
                    offer.monthlyFromUsd
                  )}/month`
              )
              .join(', ')} — in stock, with no setup fee.`
          : ''
      }${
        onRequest.length
          ? ` ${onRequest
              .map(
                (offer) =>
                  `${typeLabel(offer)} numbers are ${formatMonthly(
                    offer.monthlyFromUsd
                  )}/month${
                    offer.setupUsd
                      ? ` plus a ${formatMonthly(offer.setupUsd)} one-time carrier setup fee`
                      : ''
                  }`
              )
              .join(
                ', '
              )} — the carrier keeps no ${country.countryName} inventory of ${
              onRequest.length === 1 ? 'that type' : 'those types'
            }, so Ringee places an advance order for you and the carrier confirms the number and the final price before anything is charged.`
          : ''
      } You can cancel any time, and the number is released when the subscription ends.`
    },
    {
      question: `What do I need to get a phone number in ${country.countryName}?`,
      answer: documented.length
        ? `${country.countryName} is a regulated destination. Ordering ${documented
            .map(
              (offer) =>
                `${NUMBER_TYPE_META[
                  numberTypeSlug(offer.numberType)
                ].label.toLowerCase()} numbers requires ${offer.requirements.length} item${
                  offer.requirements.length === 1 ? '' : 's'
                }`
            )
            .join(
              ', and '
            )}. Typically that means identifying the end user, proving a local address, and supplying an ID or company registration document. The number is reserved while the documents are reviewed and activates once the regulator accepts them.`
        : `Nothing beyond your Ringee account. ${country.countryName} numbers have no regulatory document requirements, so the number activates as soon as the subscription is confirmed.`
    },
    ...(callFrom
      ? [
          {
            question: `How much does it cost to call ${country.countryName}?`,
            answer: `Calls to ${country.countryName} start at ${formatPerMinute(
              callFrom
            )} per minute${
              country.callRate?.landlineFromUsd &&
              country.callRate?.mobileFromUsd
                ? `: landlines from ${formatPerMinute(
                    country.callRate.landlineFromUsd
                  )}/min and mobiles from ${formatPerMinute(
                    country.callRate.mobileFromUsd
                  )}/min`
                : ''
            }. Minutes are pay as you go from your workspace credit, so you only pay for the calls you place. Rates differ by the network you reach: ordinary ranges sit at the low end, while surcharged, premium and satellite ranges sit at the top of each range.`
          }
        ]
      : []),
    {
      question: `What does an AI voice agent cost calling ${country.countryName}?`,
      answer: `The agent conversation is ${formatPerMinute(
        AI_VOICE_AGENT_PRICING.perMinuteUsd
      )} per minute — speech-to-text, text-to-speech, turn-taking, tools, knowledge retrieval, and the Ringee AI model — plus the per-minute price of the call itself${
        callFrom
          ? `, from ${formatPerMinute(callFrom)}/min to ${country.countryName}`
          : ''
      }. AI voice agents require an Organization workspace at $20/month with unlimited users.`
    },
    {
      question: `Can I call ${country.countryName} without buying a number there?`,
      answer: `Yes. You can call ${country.countryName} from the browser, the mobile apps, or the Chrome extension using any caller ID you already own. A local ${country.countryName} number matters for pickup rate — people answer a familiar area code far more often than an unknown foreign one.`
    },
    {
      question: `Can an AI voice agent use a ${country.countryName} number?`,
      answer: `Yes. A number you buy in ${country.countryName} works for human agents and AI voice agents alike — same workspace, same credit, same call history, recordings, transcripts, and outcomes.`
    }
  ];

  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Phone numbers', href: '/phone-numbers' },
        { name: country.countryName, href: path }
      ]}
      cta={
        <CtaSection
          title={`Start calling ${country.countryName} today`}
          description='Create a workspace, pick your number, and dial from the browser.'
        />
      }
    >
      <Section className='pt-10 pb-8 sm:pt-12'>
        <Container className='max-w-3xl'>
          <Eyebrow>Phone numbers</Eyebrow>
          <h1 className='mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            <span className='mr-2' aria-hidden>
              {country.flag}
            </span>
            {country.countryName} phone numbers from {from}/month
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            {typeLabels(country).join(', ')} numbers in {country.countryName},
            with the regulatory requirements spelled out, the per-minute price
            of calling the country
            {callFrom ? ` from ${formatPerMinute(callFrom)}/min` : ''}, and what
            an AI voice agent costs to hold the conversation. Humans and agents
            share the same numbers, credit, and call history.
          </p>
          <CtaButtons className='mt-8' />
          <p className='text-muted-foreground mt-4 text-sm'>
            {onRequest.length
              ? `Prices verified ${generatedAt}. Numbers are billed monthly; ${onRequest
                  .map((offer) => typeLabel(offer).toLowerCase())
                  .join(
                    ' and '
                  )} numbers are ordered on request and can carry a one-time carrier fee.`
              : `Prices verified ${generatedAt}. Numbers are billed monthly with no setup fee.`}
          </p>
        </Container>
      </Section>

      <Section id='numbers' className='pt-0'>
        <Container>
          <SectionHeading
            title={`Number types available in ${country.countryName}`}
            description={
              onRequest.length
                ? `Priced from the carrier's own inventory where the type is in stock, and from its published price list where the carrier sources the type to order.`
                : 'Each type is priced from real, orderable inventory — not a list price for a number nobody can buy.'
            }
            align='left'
            as='h2'
          />
          <div className='mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3'>
            {country.offers.map((offer) => (
              <NumberTypeCard
                key={offer.numberType}
                country={country}
                offer={offer}
              />
            ))}
          </div>
          {onRequest.length ? (
            <Card className='mt-6 flex items-start gap-3'>
              <Clock
                className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                aria-hidden
              />
              <p className='text-muted-foreground text-sm'>
                <span className='text-foreground font-medium'>
                  {onRequest.map(typeLabel).join(' and ')} numbers in{' '}
                  {country.countryName} are available on request.
                </span>{' '}
                {ADVANCE_ORDER_NOTE} An advance order takes longer to activate
                than a number in stock, and the regulator&apos;s requirements
                below apply either way.
              </p>
            </Card>
          ) : null}
          {country.unavailableTypes.length ? (
            <Card className='mt-6 flex items-start gap-3'>
              <Info
                className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                aria-hidden
              />
              <p className='text-muted-foreground text-sm'>
                {country.unavailableTypes
                  .map((type) => NUMBER_TYPE_META[numberTypeSlug(type)].label)
                  .join(' and ')}{' '}
                numbers are covered in {country.countryName} but had no
                inventory available to order when these prices were checked. Ask
                us and we will look again for you.
              </p>
            </Card>
          ) : null}
        </Container>
      </Section>

      {country.callRate ? (
        <Section id='call-rates' className='bg-muted/20'>
          <Container>
            <SectionHeading
              title={`What it costs to call ${country.countryName}`}
              description='Pay as you go from your workspace credit. No bundles, no minimum, no minutes that expire.'
              align='left'
              as='h2'
            />
            <div className='mt-10'>
              <CallRateTable country={country} />
            </div>
            <p className='text-muted-foreground mt-4 text-sm'>
              Each range spans the destination networks inside{' '}
              {country.countryName}: ordinary fixed and mobile ranges sit at the
              low end, and surcharged, premium or satellite ranges at the top.
              Calls are charged per minute from your workspace credit, on top of
              your plan.
            </p>
          </Container>
        </Section>
      ) : null}

      <Section id='ai-voice-agents'>
        <Container>
          <SectionHeading
            title={`AI voice agent pricing for ${country.countryName}`}
            description='An agent call runs two meters: the conversation, and the phone call it places.'
            align='left'
            as='h2'
          />
          <div className='mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]'>
            <AgentCostBreakdown country={country} />
            <Card className='h-full'>
              <h3 className='font-semibold'>What the agent does for it</h3>
              <ul className='text-muted-foreground mt-4 flex flex-col gap-3 text-sm'>
                <li>Places the call and holds the live conversation.</li>
                <li>Answers from your knowledge base while it speaks.</li>
                <li>Books meetings and callbacks during the call.</li>
                <li>
                  Returns the recording, transcript, outcome, summary, and your
                  extraction fields.
                </li>
              </ul>
              <Link
                href='/ai-voice-agents'
                className='text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline'
              >
                See how AI voice agents work
                <ArrowRight className='h-4 w-4' aria-hidden />
              </Link>
            </Card>
          </div>
        </Container>
      </Section>

      <HowItWorksSteps
        title={`Getting a ${country.countryName} number`}
        steps={[
          {
            title: 'Pick the number',
            description: `Search ${country.countryName} inventory in the dashboard, filter by city or capability, and see the monthly price before you commit.${
              onRequest.length
                ? ` For ${onRequest
                    .map((offer) => typeLabel(offer).toLowerCase())
                    .join(
                      ' and '
                    )} numbers, tell us the city or area code you need and we place the advance order with the carrier.`
                : ''
            }`
          },
          {
            title:
              documented.length > 0
                ? 'Submit the requirements'
                : 'Confirm the subscription',
            description:
              documented.length > 0
                ? 'Upload the documents and fill the fields the regulator asks for. Ringee submits them to the carrier and tracks the review for you.'
                : 'Pay the monthly subscription by card. No documents are required for this destination.'
          },
          {
            title: 'Call from anywhere',
            description:
              'Dial from the browser, the iOS and Android apps, the Chrome extension, or the Dialer SDK — or hand the number to an AI voice agent.'
          }
        ]}
      />

      {related.length ? (
        <Section>
          <Container>
            <SectionHeading
              title={`Other countries in ${country.region ?? 'the same region'}`}
              align='left'
              as='h2'
            />
            <div className='mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {related.map((other) => (
                <Link
                  key={other.countryCode}
                  href={`/phone-numbers/${other.slug}`}
                >
                  <Card className='hover:border-foreground/30 flex h-full items-center justify-between gap-3 transition-colors'>
                    <span className='flex items-center gap-2 font-medium'>
                      <span className='text-lg' aria-hidden>
                        {other.flag}
                      </span>
                      {other.countryName}
                    </span>
                    <span className='text-muted-foreground text-sm'>
                      from {formatMonthly(other.fromMonthlyUsd)}/mo
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
            <Link
              href='/phone-numbers'
              className='text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline'
            >
              All countries and prices
              <ArrowRight className='h-4 w-4' aria-hidden />
            </Link>
          </Container>
        </Section>
      ) : null}

      <FaqSection faqs={faqs} />

      <JsonLd
        data={productJsonLd({
          name: `${country.countryName} phone numbers`,
          description: `Local, toll-free and mobile phone numbers in ${country.countryName} from ${from} per month, with regulatory requirements, per-minute call rates and AI voice agent pricing.`,
          url: `${SITE_URL}${path}`,
          offers: country.offers.map((offer) => ({
            name: `${typeLabel(offer)} number in ${country.countryName}`,
            price: offer.monthlyFromUsd,
            url: `${SITE_URL}${path}/${numberTypeSlug(offer.numberType)}`,
            availability: isAdvanceOrder(offer)
              ? ('BackOrder' as const)
              : ('InStock' as const)
          }))
        })}
      />
    </DetailLayout>
  );
}
