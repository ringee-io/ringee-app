import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, Clock, MapPin } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection } from '@/features/marketing/components/faq';
import { HowItWorksSteps } from '@/features/marketing/components/detail';
import { JsonLd, productJsonLd } from '@/features/marketing/components/json-ld';
import {
  Card,
  CheckList,
  Container,
  CtaButtons,
  Eyebrow,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import {
  AgentCostBreakdown,
  CallRateTable,
  PriceTag,
  RequirementsList
} from '@/features/marketing/components/number-pricing';
import {
  ADVANCE_ORDER_NOTE,
  AI_VOICE_AGENT_PRICING,
  capabilityLabel,
  formatMonthly,
  formatPerMinute,
  getNumberOffer,
  getPhoneNumberCountry,
  isAdvanceOrder,
  requirementsState,
  listCountryTypePairs,
  NUMBER_TYPE_META,
  numberTypeSlug,
  PHONE_NUMBER_COUNTRIES,
  PRICING_GENERATED_AT,
  type PhoneNumberTypeSlug
} from '@/features/marketing/content/phone-numbers';
import { SITE_URL } from '@/features/marketing/site';

type Params = { params: Promise<{ country: string; type: string }> };

export function generateStaticParams() {
  return listCountryTypePairs();
}

function load(countrySlug: string, typeSlug: string) {
  const country = getPhoneNumberCountry(countrySlug);
  if (!country) return null;

  const offer = getNumberOffer(country, typeSlug);
  if (!offer) return null;

  return {
    country,
    offer,
    meta: NUMBER_TYPE_META[typeSlug as PhoneNumberTypeSlug]
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { country: countrySlug, type } = await params;
  const data = load(countrySlug, type);
  if (!data) return {};

  const price = formatMonthly(data.offer.monthlyFromUsd);
  const documents = data.offer.requirements.length;
  const setup = data.offer.setupUsd;

  return buildMetadata({
    title: `${data.country.countryName} ${data.meta.label} Numbers — ${price}/month | Ringee`,
    description: `${data.meta.label} phone numbers in ${data.country.countryName} for ${price}/month, ${
      isAdvanceOrder(data.offer)
        ? `${setup ? `plus a ${formatMonthly(setup)} one-time setup fee, ` : ''}ordered from the carrier on request`
        : 'no setup fee'
    }. ${
      documents
        ? `${documents} regulatory requirement${documents === 1 ? '' : 's'} listed in full`
        : 'No documents required'
    }, plus per-minute call rates and AI voice agent pricing.`,
    path: `/phone-numbers/${data.country.slug}/${type}`
  });
}

export default async function NumberTypePage({ params }: Params) {
  const { country: countrySlug, type } = await params;
  const data = load(countrySlug, type);
  if (!data) notFound();

  const { country, offer, meta } = data;
  const path = `/phone-numbers/${country.slug}/${type}`;
  const price = formatMonthly(offer.monthlyFromUsd);
  const onRequest = isAdvanceOrder(offer);
  const requirements = requirementsState(offer);
  const setup = offer.setupUsd ? formatMonthly(offer.setupUsd) : null;
  const otherTypes = country.offers.filter(
    (other) => numberTypeSlug(other.numberType) !== type
  );
  const sameTypeElsewhere = PHONE_NUMBER_COUNTRIES.filter(
    (other) =>
      other.countryCode !== country.countryCode &&
      other.offers.some((item) => numberTypeSlug(item.numberType) === type)
  ).slice(0, 6);

  const callFrom = [
    country.callRate?.landlineFromUsd ?? null,
    country.callRate?.mobileFromUsd ?? null
  ].filter((rate): rate is number => rate !== null);
  const cheapestCall = callFrom.length ? Math.min(...callFrom) : null;

  const generatedAt = new Date(PRICING_GENERATED_AT).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const faqs = [
    {
      question: `How much is a ${meta.label.toLowerCase()} number in ${country.countryName}?`,
      answer: onRequest
        ? `${price} per month${
            setup
              ? `, plus a ${setup} one-time setup fee the carrier charges to source the number`
              : ', with no one-time setup fee listed by the carrier'
          }. That is the carrier's published price for this type in ${country.countryName}; because it is not held in inventory, the carrier confirms the number and the final price before anything is charged. There is no minimum term — the subscription is monthly and you can cancel it whenever you want.`
        : `${price} per month${
            offer.monthlyToUsd > offer.monthlyFromUsd
              ? `, up to ${formatMonthly(offer.monthlyToUsd)} per month depending on which number you choose`
              : ''
          }. There is no setup fee and no minimum term — the subscription is monthly and you can cancel it whenever you want.`
    },
    {
      question: `What documents are required for a ${country.countryName} ${meta.label.toLowerCase()} number?`,
      answer: offer.requirements.length
        ? `${offer.requirements.length} requirement${
            offer.requirements.length === 1 ? '' : 's'
          }: ${offer.requirements
            .map((requirement) => requirement.name)
            .join(
              '; '
            )}. Ringee collects them in the dashboard, submits them to the carrier, and tracks the regulator's review until the number activates.`
        : requirements === 'unknown'
          ? `The regulator's requirements for this type could not be read from the carrier, so nothing is claimed here. Ringee shows what ${country.countryName} asks for when you order the number in the dashboard.`
          : `None. ${country.countryName} ${meta.label.toLowerCase()} numbers carry no regulatory document requirements, so the number is ${
              onRequest
                ? 'ordered from the carrier without any paperwork of your own'
                : 'yours as soon as the subscription is confirmed'
            }.`
    },
    {
      question: `What can a ${country.countryName} ${meta.label.toLowerCase()} number do?`,
      answer: onRequest
        ? `Voice calls in and out, which is what the carrier's price for this type covers. Anything beyond voice — SMS, MMS, fax — depends on the range the carrier sources the number from, so it is confirmed on the order rather than promised here.`
        : `${offer.capabilities
            .map((capability) => capabilityLabel(capability))
            .join(
              ', '
            )}. Capabilities are set by the carrier per country and number range, so what is listed here is what the numbers available today support.`
    },
    ...(cheapestCall
      ? [
          {
            question: `How much does calling ${country.countryName} cost with this number?`,
            answer: `Outbound calls to ${country.countryName} start at ${formatPerMinute(
              cheapestCall
            )} per minute and are charged from your workspace credit, separately from your plan. The number's monthly price covers the line itself, not the minutes.`
          }
        ]
      : []),
    {
      question: `Can an AI voice agent call from this number?`,
      answer: `Yes. The same number can be used by people and by AI voice agents. An agent conversation costs ${formatPerMinute(
        AI_VOICE_AGENT_PRICING.perMinuteUsd
      )} per minute plus the call itself, and needs an Organization workspace at $20/month with unlimited users.`
    },
    {
      question: 'How long does activation take?',
      answer: onRequest
        ? `Longer than a number in stock. The carrier has to source the number for the advance order before it can be activated${
            offer.requirements.length
              ? ', and the regulator’s review of your documents runs on top of that'
              : ''
          } — we tell you what the carrier commits to when the order is placed, rather than promise a date here.`
        : offer.requirements.length
          ? 'Once the documents are submitted, activation depends on the regulator’s review — usually a few business days. The number is held for you while the review runs.'
          : 'Immediately. Once payment is confirmed, the number is assigned to your workspace and can place and receive calls right away.'
    }
  ];

  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Phone numbers', href: '/phone-numbers' },
        { name: country.countryName, href: `/phone-numbers/${country.slug}` },
        { name: meta.label, href: path }
      ]}
      cta={
        <CtaSection
          title={`Get your ${country.countryName} ${meta.label.toLowerCase()} number`}
          description={
            onRequest
              ? `${price}/month, ordered from the carrier for you — tell us the city or area code you need and we start the order.`
              : `${price}/month, no setup fee, and calling from the browser the same day.`
          }
        />
      }
    >
      <Section className='pt-10 pb-8 sm:pt-12'>
        <Container className='max-w-3xl'>
          <Eyebrow>
            {country.countryName} · {meta.label} number
          </Eyebrow>
          <h1 className='mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            <span className='mr-2' aria-hidden>
              {country.flag}
            </span>
            {country.countryName} {meta.label.toLowerCase()} phone number —{' '}
            {price}/month
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            {meta.description}
          </p>
          {onRequest ? (
            <p className='border-border/70 bg-muted/30 text-muted-foreground mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm'>
              <Clock className='mt-0.5 h-5 w-5 shrink-0' aria-hidden />
              <span>
                <span className='text-foreground font-medium'>
                  Available on request.
                </span>{' '}
                {ADVANCE_ORDER_NOTE}
              </span>
            </p>
          ) : null}
          <CtaButtons className='mt-8' />
          <p className='text-muted-foreground mt-4 text-sm'>
            {onRequest
              ? `Price verified ${generatedAt} against the carrier's price list. Billed monthly${
                  setup ? `, after a ${setup} one-time setup fee` : ''
                }.`
              : `Price verified ${generatedAt}. Billed monthly, no setup fee.`}
          </p>
        </Container>
      </Section>

      <Section id='price' className='pt-0'>
        <Container>
          <div className='grid gap-6 lg:grid-cols-3'>
            <Card>
              <h2 className='text-sm font-semibold tracking-wide uppercase'>
                The number
              </h2>
              <PriceTag amount={price} unit='/ month' className='mt-4' />
              <p className='text-muted-foreground mt-2 text-sm'>
                {onRequest
                  ? setup
                    ? `Plus a ${setup} one-time fee the carrier charges to source it.`
                    : 'The carrier lists no one-time fee for this type.'
                  : offer.monthlyToUsd > offer.monthlyFromUsd
                    ? `Up to ${formatMonthly(offer.monthlyToUsd)}/month for premium picks in this range.`
                    : 'One flat monthly price for every number in this range.'}
              </p>
            </Card>
            <Card>
              <h2 className='text-sm font-semibold tracking-wide uppercase'>
                Calling out
              </h2>
              <PriceTag
                amount={
                  cheapestCall ? formatPerMinute(cheapestCall) : 'On request'
                }
                unit={cheapestCall ? '/ min, from' : ''}
                className='mt-4'
              />
              <p className='text-muted-foreground mt-2 text-sm'>
                Pay as you go from workspace credit, to {country.countryName}.
              </p>
            </Card>
            <Card>
              <h2 className='text-sm font-semibold tracking-wide uppercase'>
                AI voice agent
              </h2>
              <PriceTag
                amount={formatPerMinute(AI_VOICE_AGENT_PRICING.perMinuteUsd)}
                unit='/ min, plus the call'
                className='mt-4'
              />
              <p className='text-muted-foreground mt-2 text-sm'>
                Speech, voice, and the Ringee AI model included.
              </p>
            </Card>
          </div>
        </Container>
      </Section>

      <Section id='capabilities' className='bg-muted/20'>
        <Container>
          <div className='grid gap-10 md:grid-cols-2'>
            <div>
              <h2 className='text-2xl font-bold tracking-tight'>
                What this number can do
              </h2>
              <CheckList
                items={offer.capabilities.map((capability) =>
                  capabilityLabel(capability)
                )}
                className='mt-6'
              />
              {onRequest ? (
                <p className='text-muted-foreground mt-4 text-sm'>
                  Voice is what the carrier&apos;s price for this type covers.
                  Messaging and fax depend on the range the number is sourced
                  from, so they are confirmed on the order instead of promised
                  here.
                </p>
              ) : null}
              {offer.localities.length ? (
                <div className='mt-8'>
                  <h3 className='flex items-center gap-2 font-semibold'>
                    <MapPin className='h-4 w-4' aria-hidden />
                    Available in
                  </h3>
                  <p className='text-muted-foreground mt-2 text-sm'>
                    {offer.localities.join(', ')}
                    {offer.sampled >= 50 ? ', and more' : ''}.
                  </p>
                </div>
              ) : null}
            </div>
            <div>
              <h2 className='text-2xl font-bold tracking-tight'>Best for</h2>
              <CheckList items={meta.bestFor} className='mt-6' />
            </div>
          </div>
        </Container>
      </Section>

      <Section id='requirements'>
        <Container>
          <SectionHeading
            title={`What ${country.countryName} requires`}
            description={
              offer.requirements.length
                ? 'These are the regulator’s own requirements, as the carrier publishes them. Ringee collects each one in the dashboard and tracks the review.'
                : requirements === 'unknown'
                  ? 'The carrier did not answer with this destination’s requirements — the dashboard shows them when you order.'
                  : 'Nothing to prepare for this destination.'
            }
            align='left'
            as='h2'
          />
          <div className='mt-10'>
            <RequirementsList offer={offer} />
          </div>
        </Container>
      </Section>

      {country.callRate ? (
        <Section id='call-rates' className='bg-muted/20'>
          <Container>
            <SectionHeading
              title={`Calling ${country.countryName} per minute`}
              align='left'
              as='h2'
            />
            <div className='mt-10'>
              <CallRateTable country={country} />
            </div>
            <p className='text-muted-foreground mt-4 text-sm'>
              The range spans the ordinary destination networks, from the
              cheapest to the dearest. Premium, satellite, high-cost and service
              numbers are not included and are priced separately. Minutes are
              charged from your workspace credit.
            </p>
          </Container>
        </Section>
      ) : null}

      <Section id='ai-voice-agents'>
        <Container>
          <SectionHeading
            title={`Running an AI voice agent on a ${country.countryName} number`}
            align='left'
            as='h2'
          />
          <div className='mt-10'>
            <AgentCostBreakdown country={country} />
          </div>
        </Container>
      </Section>

      <HowItWorksSteps
        title={`Getting this number`}
        steps={[
          {
            title: onRequest ? 'Ask for the number' : 'Choose the number',
            description: onRequest
              ? `Tell us the city or area code you want in ${country.countryName}. Ringee places the advance order with the carrier, which comes back with the number it can source and confirms the price.`
              : `Search ${country.countryName} ${meta.label.toLowerCase()} inventory in the dashboard and see the monthly price on each number before you buy.`
          },
          {
            title: offer.requirements.length
              ? 'Submit what the regulator needs'
              : onRequest
                ? 'Confirm the order'
                : 'Confirm the subscription',
            description: offer.requirements.length
              ? `Provide the ${offer.requirements.length} requirement${
                  offer.requirements.length === 1 ? '' : 's'
                } listed above. Ringee submits them to the carrier and follows the review.`
              : onRequest
                ? 'Approve the number and the price the carrier confirmed, and the subscription starts from there.'
                : 'Pay by card and the number is assigned to your workspace immediately.'
          },
          {
            title: 'Put it to work',
            description:
              'Dial from the browser, mobile apps, Chrome extension, campaigns, or the Dialer SDK — or hand it to an AI voice agent.'
          }
        ]}
      />

      <Section className='pt-0'>
        <Container>
          <div className='grid gap-10 md:grid-cols-2'>
            {otherTypes.length ? (
              <div>
                <h2 className='text-2xl font-bold tracking-tight'>
                  Other numbers in {country.countryName}
                </h2>
                <div className='mt-6 flex flex-col gap-3'>
                  {otherTypes.map((other) => {
                    const otherType = numberTypeSlug(other.numberType);
                    return (
                      <Link
                        key={other.numberType}
                        href={`/phone-numbers/${country.slug}/${otherType}`}
                      >
                        <Card className='hover:border-foreground/30 flex items-center justify-between gap-3 transition-colors'>
                          <span className='font-medium'>
                            {NUMBER_TYPE_META[otherType].label} number
                          </span>
                          <span className='text-muted-foreground text-sm'>
                            from {formatMonthly(other.monthlyFromUsd)}/mo
                          </span>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {sameTypeElsewhere.length ? (
              <div>
                <h2 className='text-2xl font-bold tracking-tight'>
                  {meta.label} numbers elsewhere
                </h2>
                <div className='mt-6 flex flex-col gap-3'>
                  {sameTypeElsewhere.map((other) => (
                    <Link
                      key={other.countryCode}
                      href={`/phone-numbers/${other.slug}/${type}`}
                    >
                      <Card className='hover:border-foreground/30 flex items-center justify-between gap-3 transition-colors'>
                        <span className='flex items-center gap-2 font-medium'>
                          <span className='text-lg' aria-hidden>
                            {other.flag}
                          </span>
                          {other.countryName}
                        </span>
                        <ArrowRight
                          className='text-muted-foreground h-4 w-4'
                          aria-hidden
                        />
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Container>
      </Section>

      <FaqSection faqs={faqs} />

      <JsonLd
        data={productJsonLd({
          name: `${country.countryName} ${meta.label.toLowerCase()} phone number`,
          description: `${meta.tagline} ${price} per month in ${country.countryName}, with ${
            offer.requirements.length
              ? `${offer.requirements.length} regulatory requirement(s)`
              : requirements === 'unknown'
                ? 'regulatory requirements confirmed at order time'
                : 'no regulatory requirements'
          }.`,
          url: `${SITE_URL}${path}`,
          offers: [
            {
              name: `${meta.label} number in ${country.countryName}`,
              price: offer.monthlyFromUsd,
              availability: onRequest ? 'BackOrder' : 'InStock'
            }
          ]
        })}
      />
    </DetailLayout>
  );
}
