'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Phone,
  Mail,
  Building2,
  Clock,
  Users,
  BriefcaseBusiness,
  MapPin,
  Globe2,
  BadgeDollarSign,
  Building,
  Linkedin,
  Gauge,
  Layers,
  Tag,
  CalendarClock,
  Network
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export function LeadPanel() {
  const t = useTranslations('dialer.lead');
  const currentLead = useDialerLeadStore((s) => s.currentLead);
  const callStatus = useDialerAttemptStore((s) => s.callStatus);

  if (!currentLead) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6 text-center'>
        <Users className='text-muted-foreground mb-3 h-10 w-10' />
        <h3 className='font-semibold'>{t('waiting')}</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('waitingDescription')}
        </p>
      </div>
    );
  }

  const { contact, history, attempts, metadata } = currentLead;
  const displayName =
    contact.name ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    t('unknown');

  const place = [
    contact.locationCity,
    contact.locationRegion,
    contact.locationCountry
  ]
    .filter(Boolean)
    .join(', ');

  const role = [contact.jobTitle, contact.department, contact.seniority]
    .filter(Boolean)
    .join(' · ');

  const custom = { ...toRecord(contact.customFields), ...toRecord(metadata) };

  return (
    <div className='flex h-full flex-col overflow-y-auto p-4'>
      {/* Who we're calling */}
      <div className='space-y-3'>
        <div className='flex items-center gap-3'>
          <div className='bg-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white'>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className='min-w-0'>
            <h2 className='truncate text-lg font-semibold'>{displayName}</h2>
            <div className='mt-0.5 flex flex-wrap items-center gap-1.5'>
              {callStatus && (
                <Badge variant='secondary' className='text-xs capitalize'>
                  {callStatus.replace(/_/g, ' ')}
                </Badge>
              )}
              {contact.status && (
                <Badge variant='outline' className='text-xs capitalize'>
                  {contact.status.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {contact.headline && (
          <p className='text-muted-foreground text-sm italic'>
            {contact.headline}
          </p>
        )}

        <div className='space-y-2 text-sm'>
          <LeadProperty icon={Phone} value={contact.phoneNumber} />
          <LeadProperty
            icon={Mail}
            value={contact.email}
            href={contact.email ? `mailto:${contact.email}` : undefined}
          />
          <LeadProperty icon={BriefcaseBusiness} value={role || null} />
          <LeadProperty
            icon={Linkedin}
            value={contact.linkedinUrl ? t('linkedin') : null}
            href={contact.linkedinUrl ?? undefined}
          />
        </div>
      </div>

      {/* The company — the half of the briefing that opens a conversation */}
      <LeadSection
        title={t('sections.company')}
        show={Boolean(
          contact.company ||
            contact.revenue ||
            contact.companySize ||
            contact.websiteUrl
        )}
      >
        <LeadProperty icon={Building2} value={contact.company} />
        <LeadProperty icon={BadgeDollarSign} value={contact.revenue} />
        <LeadProperty icon={Building} value={contact.companySize} />
        <LeadProperty
          icon={Globe2}
          value={contact.websiteUrl}
          href={contact.websiteUrl ?? undefined}
        />
      </LeadSection>

      <LeadSection
        title={t('sections.location')}
        show={Boolean(place || contact.timezone)}
      >
        <LeadProperty icon={MapPin} value={place || null} />
        <LocalTime timezone={contact.timezone} label={t('localTime')} />
      </LeadSection>

      {/* Always shown: the attempt counter alone earns the block. */}
      <LeadSection title={t('sections.pipeline')} show>
        <LeadProperty icon={Layers} value={contact.lifecycleStage} />
        <LeadProperty
          icon={Gauge}
          value={
            contact.score != null ? t('score', { score: contact.score }) : null
          }
        />
        <LeadProperty icon={Tag} value={contact.source} />
        <LeadProperty
          icon={CalendarClock}
          value={
            contact.lastCallAt
              ? t('lastCall', {
                  date: new Date(contact.lastCallAt).toLocaleDateString()
                })
              : null
          }
        />
        <LeadProperty
          icon={Clock}
          value={t('attempt', { number: attempts + 1 })}
        />
      </LeadSection>

      {contact.summary && (
        <LeadSection title={t('sections.about')} show>
          <p className='text-muted-foreground max-h-40 overflow-y-auto text-sm whitespace-pre-line'>
            {contact.summary}
          </p>
        </LeadSection>
      )}

      {/* Whatever the enrichment or the import brought that has no column. */}
      {Object.keys(custom).length > 0 && (
        <LeadSection title={t('sections.custom')} show>
          <dl className='space-y-1.5 text-sm'>
            {Object.entries(custom).map(([key, value]) => (
              <div key={key} className='flex items-start gap-2'>
                <Network className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
                <dt className='text-muted-foreground shrink-0'>{key}:</dt>
                <dd className='min-w-0 break-words'>{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </LeadSection>
      )}

      {/* Call History */}
      <Separator className='my-4' />
      <div>
        <h3 className='mb-2 text-sm font-semibold'>{t('previousAttempts')}</h3>
        {history.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{t('noAttempts')}</p>
        ) : (
          <div className='space-y-2'>
            {history.map((h, i) => (
              <div key={i} className='rounded-md border px-3 py-2 text-sm'>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>
                    {t('attempt', { number: h.attemptNumber })}
                  </span>
                  {h.durationSec != null && (
                    <span className='text-muted-foreground text-xs'>
                      {h.durationSec}s
                    </span>
                  )}
                </div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {h.dispositionCode
                    ? h.dispositionCode.replace(/_/g, ' ')
                    : t('noDisposition')}
                  {h.endedAt && (
                    <> &middot; {new Date(h.endedAt).toLocaleDateString()}</>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A titled block of lead facts. `show` is passed rather than inferred from the
 * children: every row is a React element by the time it gets here, so "is this
 * section empty" can only be answered from the values themselves.
 */
function LeadSection({
  title,
  show,
  children
}: {
  title: string;
  show: boolean;
  children: ReactNode;
}) {
  if (!show) return null;

  return (
    <>
      <Separator className='my-4' />
      <div className='space-y-2'>
        <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          {title}
        </h3>
        {children}
      </div>
    </>
  );
}

function LeadProperty({
  icon: Icon,
  value,
  href
}: {
  icon: typeof Phone;
  value: string | null | undefined;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className='text-muted-foreground flex items-center gap-2 text-sm'>
      <Icon className='h-4 w-4 shrink-0' />
      {href ? (
        <a
          href={href}
          target='_blank'
          rel='noreferrer'
          className='truncate underline-offset-2 hover:underline'
        >
          {value}
        </a>
      ) : (
        <span className='truncate'>{value}</span>
      )}
    </div>
  );
}

/**
 * The lead's wall clock, not ours. Calling someone at 06:40 their time is the
 * fastest way to burn a number, and the agent cannot do that arithmetic while
 * the line is ringing.
 */
function LocalTime({
  timezone,
  label
}: {
  timezone: string | null;
  label: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timezone) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [timezone]);

  if (!timezone) return null;

  let time: string;
  try {
    time = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone
    }).format(now);
  } catch {
    // An unrecognised IANA zone from an import must not blank the panel.
    return null;
  }

  return (
    <LeadProperty icon={Clock} value={`${label}: ${time} (${timezone})`} />
  );
}

/** Only a flat object is renderable as key/value rows; anything else is noise. */
function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined && v !== ''
    )
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
