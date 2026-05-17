'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import {
  IconBrandGithub,
  IconBrandLinkedin,
  IconBrandX,
  IconBriefcase,
  IconBuilding,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSchool,
  IconWorld
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { ProspectPreview } from '../types';

interface Props {
  prospect: ProspectPreview;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProspectDetailModal({ prospect, open, onOpenChange }: Props) {
  const { person, company } = prospect.details;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl gap-0 p-0'>
        <DialogHeader className='border-b border-border/60 px-5 py-4'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            {prospect.fullName ?? 'Unknown prospect'}
            <Badge variant='secondary' className='capitalize'>
              {prospect.provider}
            </Badge>
          </DialogTitle>
          <p className='text-sm text-muted-foreground'>
            {[prospect.jobTitle, prospect.company]
              .filter(Boolean)
              .join(' · ') || 'No title available'}
          </p>
          {person.headline && (
            <p className='text-xs text-muted-foreground'>{person.headline}</p>
          )}
          <div className='mt-1 flex flex-wrap gap-1.5'>
            <Badge variant='outline'>Fit {prospect.fitScore}</Badge>
            {typeof prospect.confidence === 'number' && (
              <Badge variant='outline'>
                {Math.round(prospect.confidence * 100)}% confidence
              </Badge>
            )}
            <Badge variant='outline' className='gap-1'>
              <IconMail size={11} />
              {prospect.hasEmail ? 'Email available' : 'Email hidden'}
            </Badge>
            <Badge variant='outline' className='gap-1'>
              <IconPhone size={11} />
              {prospect.hasPhone ? 'Phone available' : 'Phone hidden'}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className='max-h-[65vh]'>
          <div className='flex flex-col gap-5 px-5 py-4'>
            <Links prospect={prospect} />

            <Section title='Person'>
              <FieldGrid>
                <Field label='First name' value={person.firstName} />
                <Field label='Last name' value={person.lastName} />
                <Field label='Seniority' value={person.seniority} />
                <Field label='Department' value={person.department} />
                <Field
                  label='Years of experience'
                  value={
                    person.yearsExperience !== null
                      ? String(person.yearsExperience)
                      : null
                  }
                />
                <Field label='Timezone' value={person.timezone} />
                <Field
                  label='Location'
                  value={
                    [person.city, person.region, person.country]
                      .filter(Boolean)
                      .join(', ') || null
                  }
                />
              </FieldGrid>
              {person.summary && (
                <p className='mt-1 text-sm text-muted-foreground'>
                  {person.summary}
                </p>
              )}
              <TagRow label='Languages' values={person.languages} />
              <TagRow label='Skills' values={person.skills} />
            </Section>

            {person.workHistory.length > 0 && (
              <Section title='Work history'>
                <ul className='flex flex-col gap-2'>
                  {person.workHistory.map((w, i) => (
                    <li key={i} className='flex items-start gap-2 text-sm'>
                      <IconBriefcase
                        size={14}
                        className='mt-0.5 shrink-0 text-muted-foreground'
                      />
                      <span>
                        {[w.title, w.company].filter(Boolean).join(' — ') ||
                          'Unknown role'}
                        {w.current && (
                          <Badge
                            variant='secondary'
                            className='ml-1.5 text-[10px]'
                          >
                            Current
                          </Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {person.education.length > 0 && (
              <Section title='Education'>
                <ul className='flex flex-col gap-2'>
                  {person.education.map((e, i) => (
                    <li key={i} className='flex items-start gap-2 text-sm'>
                      <IconSchool
                        size={14}
                        className='mt-0.5 shrink-0 text-muted-foreground'
                      />
                      <span>
                        {[e.school, e.degree, e.field]
                          .filter(Boolean)
                          .join(' — ') || 'Unknown'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {company && (
              <Section title='Company'>
                <FieldGrid>
                  <Field label='Name' value={company.name} />
                  <Field label='Legal name' value={company.legalName} />
                  <Field label='Industry' value={company.industry} />
                  <Field label='Sub-industry' value={company.subIndustry} />
                  <Field
                    label='Employees'
                    value={
                      company.employeeCountRange ??
                      company.size ??
                      (company.employeeCount !== null
                        ? String(company.employeeCount)
                        : null)
                    }
                  />
                  <Field label='Revenue' value={company.revenueRange} />
                  <Field label='Funding stage' value={company.fundingStage} />
                  <Field
                    label='Founded'
                    value={
                      company.foundedYear !== null
                        ? String(company.foundedYear)
                        : null
                    }
                  />
                  <Field label='Type' value={company.companyType} />
                  <Field label='Domain' value={company.domain} />
                  <Field label='Location' value={company.location} />
                </FieldGrid>
                {company.description && (
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {company.description}
                  </p>
                )}
                <TagRow label='Technologies' values={company.technologies} />
                <TagRow label='Keywords' values={company.keywords} />
              </Section>
            )}

            <Section title='Why it fits'>
              <ul className='flex flex-col gap-1'>
                {prospect.reasons.map((r, i) => (
                  <li key={i} className='flex gap-1.5 text-sm'>
                    <span className='text-primary'>•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Links({ prospect }: { prospect: ProspectPreview }) {
  const { person, company } = prospect.details;
  const links: Array<{
    href: string;
    label: string;
    icon: typeof IconWorld;
  }> = [];
  const linkedin = prospect.linkedinUrl ?? person.linkedinUrl;
  if (linkedin)
    links.push({ href: linkedin, label: 'LinkedIn', icon: IconBrandLinkedin });
  if (person.twitterUrl)
    links.push({ href: person.twitterUrl, label: 'X', icon: IconBrandX });
  if (person.githubUrl)
    links.push({
      href: person.githubUrl,
      label: 'GitHub',
      icon: IconBrandGithub
    });
  if (person.websiteUrl)
    links.push({
      href: person.websiteUrl,
      label: 'Website',
      icon: IconWorld
    });
  if (company?.linkedinUrl)
    links.push({
      href: company.linkedinUrl,
      label: 'Company',
      icon: IconBuilding
    });
  if (company?.website)
    links.push({
      href: company.website,
      label: 'Company site',
      icon: IconMapPin
    });

  if (links.length === 0) return null;
  return (
    <div className='flex flex-wrap gap-2'>
      {links.map((l) => {
        const Icon = l.icon;
        return (
          <a
            key={l.label}
            href={l.href}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-border hover:bg-muted'
          >
            <Icon size={13} />
            {l.label}
          </a>
        );
      })}
    </div>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <dl className='grid grid-cols-2 gap-x-4 gap-y-2.5'>{children}</dl>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className='flex flex-col gap-0.5'>
      <dt className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </dt>
      <dd className='text-sm break-words'>{value}</dd>
    </div>
  );
}

function TagRow({ label, values }: { label: string; values: string[] }) {
  if (!values || values.length === 0) return null;
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </span>
      <div className='flex flex-wrap gap-1'>
        {values.map((v, i) => (
          <Badge key={i} variant='outline' className='text-[11px] font-normal'>
            {v}
          </Badge>
        ))}
      </div>
    </div>
  );
}
