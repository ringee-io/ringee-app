import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Bot, Globe2, PhoneCall, Wallet } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { Breadcrumbs } from '@/features/marketing/components/breadcrumbs';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  JsonLd,
  itemListJsonLd
} from '@/features/marketing/components/json-ld';
import {
  Card,
  Container,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { CountryPricingExplorer } from '@/features/marketing/components/country-pricing-explorer';
import {
  AI_VOICE_AGENT_PRICING,
  CHEAPEST_MONTHLY_USD,
  CHEAPEST_PER_MINUTE_USD,
  countriesByRegion,
  formatMonthly,
  formatPerMinute,
  isAdvanceOrder,
  offerTypeLabel,
  PHONE_NUMBER_COUNTRIES,
  PRICING_GENERATED_AT
} from '@/features/marketing/content/phone-numbers';

const COUNTRY_COUNT = PHONE_NUMBER_COUNTRIES.length;
const FROM_MONTHLY = formatMonthly(CHEAPEST_MONTHLY_USD);
const FROM_PER_MINUTE = formatPerMinute(CHEAPEST_PER_MINUTE_USD);
const AGENT_PER_MINUTE = formatPerMinute(AI_VOICE_AGENT_PRICING.perMinuteUsd);

export const metadata: Metadata = buildMetadata({
  title: `Phone Number Pricing by Country — From ${FROM_MONTHLY}/month | Ringee`,
  description: `Buy phone numbers in ${COUNTRY_COUNT} countries from ${FROM_MONTHLY}/month. See local, toll-free, and mobile number prices, the regulatory documents each country needs, per-minute call rates from ${FROM_PER_MINUTE}, and AI voice agent pricing.`,
  path: '/phone-numbers'
});

const PRICING_PILLARS = [
  {
    icon: Wallet,
    title: 'The number, per month',
    body: `A phone number is a monthly subscription from ${FROM_MONTHLY}/month, with no setup fee on the numbers you can buy from stock. You can cancel it whenever you want, and the price you see is the price you pay.`
  },
  {
    icon: PhoneCall,
    title: 'The minutes you talk',
    body: `Calling is pay as you go, from ${FROM_PER_MINUTE}/min, charged from your workspace credit. No bundles to buy and no minutes to lose at the end of the month.`
  },
  {
    icon: Bot,
    title: 'The AI voice agent',
    body: `An agent conversation costs ${AGENT_PER_MINUTE}/min on top of the call it places — speech, voice, and the Ringee AI model included.`
  }
];

const FAQS = [
  {
    question: 'How much does a phone number cost?',
    answer: `Phone numbers start at ${FROM_MONTHLY} per month and are billed as a monthly subscription. Numbers bought from stock carry no setup fee; a type the carrier has to source on request can carry a one-time carrier setup fee, which is shown on that country's page before you order. The exact price depends on the country and the number type: local numbers are usually the cheapest, mobile and toll-free numbers cost more in most countries. Every country's price is listed on its own page.`
  },
  {
    question: 'Which countries can I get a phone number in?',
    answer: `Ringee has numbers available to order in ${COUNTRY_COUNT} countries today, across local, toll-free, and mobile ranges. The list reflects real, orderable inventory — a country only appears when a number can actually be bought in it. A type the carrier sells there but keeps no stock of is marked “on request”: it carries the carrier's published price and is sourced by advance order rather than bought in the dashboard.`
  },
  {
    question: 'What documents do I need to buy a number?',
    answer:
      'It depends on the country. Many countries need nothing at all, while others require proof of a local address, a copy of an ID or company registration certificate, or a signed registration form for the regulator. Each country page lists the exact requirements for each number type, with the acceptance criteria and an example.'
  },
  {
    question: 'How much does it cost to call each country?',
    answer: `Per-minute rates start at ${FROM_PER_MINUTE}/min and vary by destination and by whether you reach a landline or a mobile. Each country page shows the range for both. Minutes are paid from your workspace credit, separately from your plan.`
  },
  {
    question: 'How are AI voice agent calls priced?',
    answer: `An AI voice agent costs ${AGENT_PER_MINUTE} per minute for the conversation itself — speech-to-text, text-to-speech, turn-taking, tools, knowledge retrieval, and the Ringee AI model — plus the per-minute price of the call it places to that country. Agents need an Organization workspace, which is $20/month with unlimited users. Bringing your own OpenAI, Claude, or Gemini key bills those tokens to your own account instead.`
  },
  {
    question: 'Do I need a phone number in a country to call it?',
    answer:
      'No. You can call any destination in the rate list from the browser, the mobile apps, or the Chrome extension without owning a number there. A local number matters for pickup rate: it shows the person a familiar area code instead of a foreign one, and it is what caller ID rotation needs.'
  }
];

/** Markets teams ask for first, in the order they usually ask. */
const POPULAR_COUNTRY_CODES = ['US', 'GB', 'CA', 'ES', 'DE', 'FR', 'AU', 'MX'];

export default function PhoneNumbersIndexPage() {
  const regionLabels = new Map(
    countriesByRegion().flatMap((region) =>
      region.countries.map((country) => [country.countryCode, region.label])
    )
  );

  const rows = PHONE_NUMBER_COUNTRIES.map((country) => {
    const callFrom = [
      country.callRate?.landlineFromUsd ?? null,
      country.callRate?.mobileFromUsd ?? null
    ].filter((rate): rate is number => rate !== null);

    return {
      slug: country.slug,
      name: country.countryName,
      flag: country.flag,
      regionLabel: regionLabels.get(country.countryCode) ?? '',
      types: country.offers.map((offer) => offerTypeLabel(offer)),
      fromMonthly: formatMonthly(country.fromMonthlyUsd),
      callFrom: callFrom.length ? formatPerMinute(Math.min(...callFrom)) : null
    };
  });

  const popular = POPULAR_COUNTRY_CODES.map((code) =>
    PHONE_NUMBER_COUNTRIES.find((country) => country.countryCode === code)
  ).filter((country) => country !== undefined);

  const generatedAt = new Date(PRICING_GENERATED_AT).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  return (
    <>
      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: 'Phone numbers', href: '/phone-numbers' }
        ]}
      />

      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Phone number pricing, country by country
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Buy a local, toll-free, or mobile number in {COUNTRY_COUNT}{' '}
            countries from {FROM_MONTHLY}/month, call out from {FROM_PER_MINUTE}
            /min, and let AI voice agents hold the conversation from{' '}
            {AGENT_PER_MINUTE}/min. Every price below is the price Ringee
            charges — the same figures the app bills you with.
          </p>
          <p className='text-muted-foreground mt-4 text-sm'>
            Prices verified {generatedAt}. Numbers are billed monthly — no setup
            fee in stock, a one-time carrier fee on the types sourced on
            request; minutes are pay as you go.
          </p>
        </Container>
      </Section>

      <Section className='pt-6'>
        <Container>
          <div className='grid gap-5 md:grid-cols-3'>
            {PRICING_PILLARS.map((pillar) => (
              <Card key={pillar.title} className='h-full'>
                <pillar.icon className='text-primary h-6 w-6' aria-hidden />
                <h2 className='mt-4 text-lg font-semibold'>{pillar.title}</h2>
                <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                  {pillar.body}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id='popular' className='pt-6'>
        <Container>
          <SectionHeading
            title='Where teams buy first'
            description='The destinations Ringee customers ask for most, with the entry price for each.'
            align='left'
            as='h2'
          />
          <div className='mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {popular.map((country) => (
              <Link
                key={country.countryCode}
                href={`/phone-numbers/${country.slug}`}
              >
                <Card className='hover:border-foreground/30 h-full transition-colors'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='text-2xl' aria-hidden>
                      {country.flag}
                    </span>
                    <ArrowRight
                      className='text-muted-foreground h-4 w-4'
                      aria-hidden
                    />
                  </div>
                  <h3 className='mt-4 font-semibold'>{country.countryName}</h3>
                  <p className='mt-2 text-sm font-semibold'>
                    Numbers from {formatMonthly(country.fromMonthlyUsd)}
                    <span className='text-muted-foreground font-normal'>
                      {' '}
                      /mo
                    </span>
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    {country.offers
                      .map((offer) => offerTypeLabel(offer))
                      .join(' · ')}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <Section id='countries' className='pt-6'>
        <Container>
          <div className='flex items-center gap-3'>
            <Globe2 className='text-primary h-6 w-6' aria-hidden />
            <SectionHeading
              title='Every country, with its price'
              align='left'
              as='h2'
            />
          </div>
          <p className='text-muted-foreground mt-2'>
            {COUNTRY_COUNT} countries with numbers available to order today.
            Each one links to its requirements, call rates and AI voice agent
            pricing.
          </p>
          <div className='mt-8'>
            <CountryPricingExplorer rows={rows} />
          </div>
          {PHONE_NUMBER_COUNTRIES.some((country) =>
            country.offers.some(isAdvanceOrder)
          ) ? (
            <p className='text-muted-foreground mt-4 text-sm'>
              A type marked <span className='font-medium'>on request</span> is
              one the carrier sells in that country without keeping stock of it.
              The price is the carrier&apos;s own, and Ringee places an advance
              order for you instead of you picking the number in the dashboard.
            </p>
          ) : null}
        </Container>
      </Section>

      <FaqSection faqs={FAQS} />
      <CtaSection
        title='Get a number where your leads are'
        description='Pick a country, check what it needs, and start calling from the browser the same day.'
      />

      <JsonLd
        data={itemListJsonLd({
          name: 'Ringee phone number pricing by country',
          items: PHONE_NUMBER_COUNTRIES.map((country) => ({
            name: `${country.countryName} phone numbers`,
            href: `/phone-numbers/${country.slug}`
          }))
        })}
      />
    </>
  );
}
