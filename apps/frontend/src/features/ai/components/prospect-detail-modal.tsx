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
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ProspectPreview } from '../types';

interface Props {
  prospect: ProspectPreview;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProspectDetailModal({ prospect, open, onOpenChange }: Props) {
  const t = useTranslations('ai.prospect');
  const { person, company } = prospect.details;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl gap-0 p-0'>
        <DialogHeader className='border-border/60 border-b px-5 py-4'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            {prospect.fullName ?? t('unknownProspect')}
            <Badge variant='secondary' className='capitalize'>
              {prospect.provider}
            </Badge>
          </DialogTitle>
          <p className='text-muted-foreground text-sm'>
            {[prospect.jobTitle, prospect.company]
              .filter(Boolean)
              .join(' · ') || t('noTitle')}
          </p>
          {person.headline && (
            <p className='text-muted-foreground text-xs'>{person.headline}</p>
          )}
          <div className='mt-1 flex flex-wrap gap-1.5'>
            <Badge variant='outline'>
              {t('fit', { score: prospect.fitScore })}
            </Badge>
            {typeof prospect.confidence === 'number' && (
              <Badge variant='outline'>
                {t('confidence', {
                  percent: Math.round(prospect.confidence * 100)
                })}
              </Badge>
            )}
            <Badge variant='outline' className='gap-1'>
              <IconMail size={11} />
              {prospect.hasEmail ? t('emailAvailable') : t('emailHidden')}
            </Badge>
            <Badge variant='outline' className='gap-1'>
              <IconPhone size={11} />
              {prospect.hasPhone ? t('phoneAvailable') : t('phoneHidden')}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className='max-h-[65vh]'>
          <div className='flex flex-col gap-5 px-5 py-4'>
            <Links prospect={prospect} />

            <Section title={t('sectionPerson')}>
              <FieldGrid>
                <Field label={t('fieldFirstName')} value={person.firstName} />
                <Field label={t('fieldLastName')} value={person.lastName} />
                <Field label={t('fieldSeniority')} value={person.seniority} />
                <Field label={t('fieldDepartment')} value={person.department} />
                <Field
                  label={t('fieldYearsExperience')}
                  value={
                    person.yearsExperience !== null
                      ? String(person.yearsExperience)
                      : null
                  }
                />
                <Field label={t('fieldTimezone')} value={person.timezone} />
                <Field
                  label={t('fieldLocation')}
                  value={
                    [person.city, person.region, person.country]
                      .filter(Boolean)
                      .join(', ') || null
                  }
                />
              </FieldGrid>
              {person.summary && (
                <p className='text-muted-foreground mt-1 text-sm'>
                  {person.summary}
                </p>
              )}
              <TagRow label={t('fieldLanguages')} values={person.languages} />
              <TagRow label={t('fieldSkills')} values={person.skills} />
            </Section>

            {person.workHistory.length > 0 && (
              <Section title={t('sectionWorkHistory')}>
                <ul className='flex flex-col gap-2'>
                  {person.workHistory.map((w, i) => (
                    <li key={i} className='flex items-start gap-2 text-sm'>
                      <IconBriefcase
                        size={14}
                        className='text-muted-foreground mt-0.5 shrink-0'
                      />
                      <span>
                        {[w.title, w.company].filter(Boolean).join(' — ') ||
                          t('unknownRole')}
                        {w.current && (
                          <Badge
                            variant='secondary'
                            className='ml-1.5 text-[10px]'
                          >
                            {t('current')}
                          </Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {person.education.length > 0 && (
              <Section title={t('sectionEducation')}>
                <ul className='flex flex-col gap-2'>
                  {person.education.map((e, i) => (
                    <li key={i} className='flex items-start gap-2 text-sm'>
                      <IconSchool
                        size={14}
                        className='text-muted-foreground mt-0.5 shrink-0'
                      />
                      <span>
                        {[e.school, e.degree, e.field]
                          .filter(Boolean)
                          .join(' — ') || t('unknown')}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {company && (
              <Section title={t('sectionCompany')}>
                <FieldGrid>
                  <Field label={t('fieldName')} value={company.name} />
                  <Field
                    label={t('fieldLegalName')}
                    value={company.legalName}
                  />
                  <Field label={t('fieldIndustry')} value={company.industry} />
                  <Field
                    label={t('fieldSubIndustry')}
                    value={company.subIndustry}
                  />
                  <Field
                    label={t('fieldEmployees')}
                    value={
                      company.employeeCountRange ??
                      company.size ??
                      (company.employeeCount !== null
                        ? String(company.employeeCount)
                        : null)
                    }
                  />
                  <Field
                    label={t('fieldRevenue')}
                    value={company.revenueRange}
                  />
                  <Field
                    label={t('fieldFundingStage')}
                    value={company.fundingStage}
                  />
                  <Field
                    label={t('fieldFounded')}
                    value={
                      company.foundedYear !== null
                        ? String(company.foundedYear)
                        : null
                    }
                  />
                  <Field label={t('fieldType')} value={company.companyType} />
                  <Field label={t('fieldDomain')} value={company.domain} />
                  <Field label={t('fieldLocation')} value={company.location} />
                </FieldGrid>
                {company.description && (
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {company.description}
                  </p>
                )}
                <TagRow
                  label={t('fieldTechnologies')}
                  values={company.technologies}
                />
                <TagRow label={t('fieldKeywords')} values={company.keywords} />
              </Section>
            )}

            <Section title={t('sectionWhyFits')}>
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
  const t = useTranslations('ai.prospect');
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
      label: t('linkWebsite'),
      icon: IconWorld
    });
  if (company?.linkedinUrl)
    links.push({
      href: company.linkedinUrl,
      label: t('linkCompany'),
      icon: IconBuilding
    });
  if (company?.website)
    links.push({
      href: company.website,
      label: t('linkCompanySite'),
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
            className='border-border/70 bg-background hover:border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors'
          >
            <Icon size={13} />
            {l.label}
          </a>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className='grid grid-cols-2 gap-x-4 gap-y-2.5'>{children}</dl>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className='flex flex-col gap-0.5'>
      <dt className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
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
      <span className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
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
