'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { CreateNoteModal } from './create.note.modal';
import { ManageContactTagsModal } from './manage-contact-tags-popover';
import { CrmSyncActions } from './crm-sync-actions';
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Briefcase,
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash,
  PhoneCall,
  Tag,
  Globe,
  ArrowUpRight,
  Linkedin,
  Twitter,
  Github,
  Facebook,
  Instagram,
  Youtube,
  MapPin,
  Languages as LanguagesIcon,
  Wrench,
  GraduationCap,
  BadgeCheck,
  Sparkles,
  BadgeDollarSign,
  UsersRound
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';
import { ContactEnrichButton } from '@/features/integrations/components/contact-enrich-button';
import { ContactRevealButtons } from '@/features/integrations/components/contact-reveal-buttons';
import { useTranslations } from 'next-intl';

interface ContactPhone {
  id: string;
  phone: string;
  phoneE164?: string | null;
  type?: string | null;
  isPrimary: boolean;
}

interface ContactEmail {
  id: string;
  email: string;
  type?: string | null;
  isPrimary: boolean;
}

interface ContactAffiliation {
  id: string;
  role?: string | null;
  isPrimary: boolean;
  company: {
    id: string;
    name: string;
    domain?: string | null;
    industry?: string | null;
  };
}

interface ContactTag {
  tag: {
    id: string;
    name: string;
    color?: string | null;
  };
}

interface ContactNote {
  id: string;
  content: string;
  createdAt: string;
}

interface ContactCall {
  id: string;
  direction?: string;
  status?: string;
  duration?: number;
  toNumber?: string;
  fromNumber?: string;
  createdAt: string;
}

export interface ContactDetailData {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber: string;
  email?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  revenue?: string | null;
  companySize?: string | null;
  source?: string | null;
  lastCallAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Extended / enrichment fields
  headline?: string | null;
  summary?: string | null;
  seniority?: string | null;
  department?: string | null;
  yearsExperience?: number | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  githubUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  tiktokUrl?: string | null;
  websiteUrl?: string | null;
  blogUrl?: string | null;
  calendlyUrl?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  timezone?: string | null;
  languages?: string[] | null;
  skills?: string[] | null;
  interests?: string[] | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  lastEnrichedAt?: string | null;
  enrichmentMetadata?: {
    provider?: string;
    externalId?: string;
    confidence?: number | null;
  } | null;
  phones: ContactPhone[];
  emails: ContactEmail[];
  affiliations: ContactAffiliation[];
  tags: ContactTag[];
  notes: ContactNote[];
  calls: ContactCall[];
}

interface SocialLink {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  url: string;
}

function InfoRow({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className='flex items-start gap-3 py-2'>
      <Icon className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
      <div>
        <p className='text-muted-foreground text-xs'>{label}</p>
        <p className='text-sm'>{value}</p>
      </div>
    </div>
  );
}

function formatDuration(seconds?: number) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ContactDetail({
  contact
}: {
  contact: ContactDetailData;
}) {
  const router = useRouter();
  const api = useApi();
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    noteId?: string;
  }>({ open: false });
  const [deleteContactModal, setDeleteContactModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const quickDialerCall = useQuickDialerCall();
  const t = useTranslations('contacts.detail');
  const tCommon = useTranslations('common');

  const displayName =
    contact.name ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    t('unknown');
  const initial = displayName.charAt(0)?.toUpperCase() || '?';

  async function handleDeleteNote() {
    if (!deleteModal.noteId) return;
    setLoading(true);
    try {
      await api.delete(`/contacts/${contact.id}/notes/${deleteModal.noteId}`);
      setDeleteModal({ open: false });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteContact() {
    setLoading(true);
    try {
      await api.delete(`/contacts/${contact.id}`);
      toast.success(`${t('deleteContact')} ${tCommon('success')}`);
      router.push('/dashboard/contact');
    } catch {
      toast.error(tCommon('somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='mx-auto w-full max-w-6xl space-y-6'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-4'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => router.push('/dashboard/contact')}
          >
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <div className='bg-primary flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white'>
            {initial}
          </div>
          <div>
            <h1 className='text-2xl font-bold'>{displayName}</h1>
            <div className='text-muted-foreground flex items-center gap-2 text-sm'>
              {contact.jobTitle && <span>{contact.jobTitle}</span>}
              {contact.jobTitle && contact.company && <span>{t('at')}</span>}
              {contact.company && <span>{contact.company}</span>}
            </div>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => quickDialerCall.handleRecall(contact.phoneNumber)}
          >
            <PhoneCall className='mr-2 h-4 w-4' />
            {t('call')}
          </Button>
          <ContactEnrichButton
            contactId={contact.id}
            variant='outline'
            size='sm'
            onEnriched={() => router.refresh()}
          />
          <Link href={`/dashboard/contact/${contact.id}/edit`}>
            <Button variant='outline' size='sm'>
              <Edit className='mr-2 h-4 w-4' />
              {t('edit')}
            </Button>
          </Link>
          <Button
            variant='outline'
            size='sm'
            className='text-red-600 hover:text-red-700'
            onClick={() => setDeleteContactModal(true)}
          >
            <Trash className='mr-2 h-4 w-4' />
            {t('delete')}
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        {/* Left Column - Contact Info */}
        <div className='space-y-6 lg:col-span-1'>
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>
                {t('contactInformation')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='flex items-start gap-3 py-2'>
                <Phone className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
                <div className='flex-1'>
                  <p className='text-muted-foreground text-xs'>{t('phone')}</p>
                  <p className='flex items-center gap-1.5 text-sm'>
                    {contact.phoneNumber}
                    {contact.phoneVerified && (
                      <BadgeCheck
                        className='h-3.5 w-3.5 text-green-600'
                        aria-label='verified'
                      />
                    )}
                  </p>
                </div>
              </div>
              {contact.email && (
                <div className='flex items-start gap-3 py-2'>
                  <Mail className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
                  <div className='flex-1'>
                    <p className='text-muted-foreground text-xs'>
                      {t('email')}
                    </p>
                    <p className='flex items-center gap-1.5 text-sm break-all'>
                      {contact.email}
                      {contact.emailVerified && (
                        <BadgeCheck
                          className='h-3.5 w-3.5 text-green-600'
                          aria-label='verified'
                        />
                      )}
                    </p>
                  </div>
                </div>
              )}
              <InfoRow
                icon={Building2}
                label={t('company')}
                value={contact.company}
              />
              <InfoRow
                icon={Briefcase}
                label={t('jobTitle')}
                value={contact.jobTitle}
              />
              <InfoRow
                icon={BadgeDollarSign}
                label={t('revenue')}
                value={contact.revenue}
              />
              <InfoRow
                icon={UsersRound}
                label={t('companySize')}
                value={contact.companySize}
              />
              <InfoRow
                icon={Globe}
                label={t('source')}
                value={contact.source
                  ?.replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              />
              <InfoRow
                icon={Calendar}
                label={t('created')}
                value={new Date(contact.createdAt).toLocaleDateString()}
              />
              {contact.lastCallAt && (
                <InfoRow
                  icon={Clock}
                  label={t('lastCall')}
                  value={new Date(contact.lastCallAt).toLocaleString()}
                />
              )}
              {contact.lastEnrichedAt && (
                <InfoRow
                  icon={Sparkles}
                  label={
                    contact.enrichmentMetadata?.provider
                      ? t('lastEnrichedVia', {
                          provider: contact.enrichmentMetadata.provider
                        })
                      : t('lastEnriched')
                  }
                  value={new Date(contact.lastEnrichedAt).toLocaleString()}
                />
              )}
              {contact.enrichmentMetadata?.externalId &&
                contact.enrichmentMetadata?.provider && (
                  <div className='pt-3'>
                    <ContactRevealButtons
                      contactId={contact.id}
                      provider={contact.enrichmentMetadata.provider ?? null}
                      hasEmail={!!contact.email}
                      hasPhone={
                        !contact.phoneNumber?.includes('***') ||
                        (!!contact.phoneNumber &&
                          !/^(noPhone:|prospeo:|apollo:)/i.test(
                            contact.phoneNumber
                          ))
                      }
                      onRevealed={() => router.refresh()}
                    />
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Professional */}
          {(contact.headline ||
            contact.summary ||
            contact.seniority ||
            contact.department ||
            contact.yearsExperience != null ||
            (contact.skills?.length ?? 0) > 0 ||
            (contact.languages?.length ?? 0) > 0 ||
            (contact.interests?.length ?? 0) > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>{t('professional')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {contact.headline && (
                  <p className='text-sm font-medium'>{contact.headline}</p>
                )}
                {contact.summary && (
                  <p className='text-muted-foreground text-sm whitespace-pre-wrap'>
                    {contact.summary}
                  </p>
                )}
                <div className='space-y-1'>
                  <InfoRow
                    icon={GraduationCap}
                    label={t('seniority')}
                    value={contact.seniority}
                  />
                  <InfoRow
                    icon={Briefcase}
                    label={t('department')}
                    value={contact.department}
                  />
                  {contact.yearsExperience != null && (
                    <InfoRow
                      icon={Clock}
                      label={t('yearsOfExperience')}
                      value={`${contact.yearsExperience}`}
                    />
                  )}
                </div>
                {(contact.skills?.length ?? 0) > 0 && (
                  <div>
                    <p className='text-muted-foreground mb-1 flex items-center gap-1.5 text-xs'>
                      <Wrench className='h-3.5 w-3.5' /> {t('skills')}
                    </p>
                    <div className='flex flex-wrap gap-1.5'>
                      {contact.skills!.map((s) => (
                        <Badge key={s} variant='secondary' className='text-xs'>
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(contact.languages?.length ?? 0) > 0 && (
                  <div>
                    <p className='text-muted-foreground mb-1 flex items-center gap-1.5 text-xs'>
                      <LanguagesIcon className='h-3.5 w-3.5' /> {t('languages')}
                    </p>
                    <div className='flex flex-wrap gap-1.5'>
                      {contact.languages!.map((l) => (
                        <Badge key={l} variant='outline' className='text-xs'>
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(contact.interests?.length ?? 0) > 0 && (
                  <div>
                    <p className='text-muted-foreground mb-1 text-xs'>
                      {t('interests')}
                    </p>
                    <div className='flex flex-wrap gap-1.5'>
                      {contact.interests!.map((i) => (
                        <Badge key={i} variant='outline' className='text-xs'>
                          {i}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Location */}
          {(contact.locationCity ||
            contact.locationRegion ||
            contact.locationCountry ||
            contact.timezone) && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>{t('location')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-1'>
                <InfoRow
                  icon={MapPin}
                  label={t('location')}
                  value={
                    [
                      contact.locationCity,
                      contact.locationRegion,
                      contact.locationCountry
                    ]
                      .filter(Boolean)
                      .join(', ') || null
                  }
                />
                <InfoRow
                  icon={Clock}
                  label={t('timezone')}
                  value={contact.timezone}
                />
              </CardContent>
            </Card>
          )}

          {/* Social profiles */}
          {(() => {
            const socials: SocialLink[] = [
              contact.linkedinUrl && {
                icon: Linkedin,
                label: 'LinkedIn',
                url: contact.linkedinUrl
              },
              contact.twitterUrl && {
                icon: Twitter,
                label: 'Twitter / X',
                url: contact.twitterUrl
              },
              contact.githubUrl && {
                icon: Github,
                label: 'GitHub',
                url: contact.githubUrl
              },
              contact.facebookUrl && {
                icon: Facebook,
                label: 'Facebook',
                url: contact.facebookUrl
              },
              contact.instagramUrl && {
                icon: Instagram,
                label: 'Instagram',
                url: contact.instagramUrl
              },
              contact.youtubeUrl && {
                icon: Youtube,
                label: 'YouTube',
                url: contact.youtubeUrl
              },
              contact.websiteUrl && {
                icon: Globe,
                label: t('website'),
                url: contact.websiteUrl
              },
              contact.blogUrl && {
                icon: Globe,
                label: t('blog'),
                url: contact.blogUrl
              },
              contact.calendlyUrl && {
                icon: Calendar,
                label: 'Calendly',
                url: contact.calendlyUrl
              }
            ].filter(Boolean) as SocialLink[];
            if (socials.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {t('socialProfiles')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='space-y-2'>
                    {socials.map(({ icon: Icon, label, url }) => (
                      <a
                        key={`${label}-${url}`}
                        href={url}
                        target='_blank'
                        rel='noreferrer'
                        className='text-primary flex items-center gap-2 text-sm hover:underline'
                      >
                        <Icon className='h-4 w-4' />
                        <span>{label}</span>
                        <ArrowUpRight className='text-muted-foreground ml-auto h-3.5 w-3.5' />
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Additional Phones */}
          {contact.phones.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>{t('phoneNumbers')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {contact.phones.map((p) => (
                    <div
                      key={p.id}
                      className='flex items-center justify-between text-sm'
                    >
                      <div className='flex items-center gap-2'>
                        <Phone className='text-muted-foreground h-3.5 w-3.5' />
                        <span>{p.phone}</span>
                      </div>
                      <div className='flex items-center gap-1'>
                        {p.type && (
                          <Badge variant='outline' className='text-xs'>
                            {p.type}
                          </Badge>
                        )}
                        {p.isPrimary && (
                          <Badge className='text-xs'>{t('primary')}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional Emails */}
          {contact.emails.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  {t('emailAddresses')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {contact.emails.map((e) => (
                    <div
                      key={e.id}
                      className='flex items-center justify-between text-sm'
                    >
                      <div className='flex items-center gap-2'>
                        <Mail className='text-muted-foreground h-3.5 w-3.5' />
                        <span>{e.email}</span>
                      </div>
                      <div className='flex items-center gap-1'>
                        {e.type && (
                          <Badge variant='outline' className='text-xs'>
                            {e.type}
                          </Badge>
                        )}
                        {e.isPrimary && (
                          <Badge className='text-xs'>{t('primary')}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Company Affiliations */}
          {contact.affiliations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>{t('companies')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  {contact.affiliations.map((aff) => (
                    <div key={aff.id} className='flex items-start gap-3'>
                      <Building2 className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
                      <div>
                        <p className='text-sm font-medium'>
                          {aff.company.name}
                        </p>
                        {aff.role && (
                          <p className='text-muted-foreground text-xs'>
                            {aff.role}
                          </p>
                        )}
                        {aff.company.industry && (
                          <p className='text-muted-foreground text-xs'>
                            {aff.company.industry}
                          </p>
                        )}
                        {aff.isPrimary && (
                          <Badge className='mt-1 text-xs'>{t('primary')}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          <Card>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-base'>{t('tags')}</CardTitle>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => setTagsModalOpen(true)}
                >
                  <Tag className='mr-1 h-3.5 w-3.5' /> {t('manage')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contact.tags.length > 0 ? (
                <div className='flex flex-wrap gap-1.5'>
                  {contact.tags.map(({ tag }) => (
                    <Badge
                      key={tag.id}
                      variant='secondary'
                      style={{
                        backgroundColor: `${tag.color || '#3B82F6'}20`,
                        color: tag.color || '#3B82F6',
                        borderColor: `${tag.color || '#3B82F6'}40`
                      }}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>{t('noTags')}</p>
              )}
            </CardContent>
          </Card>

          {/* CRM Actions */}
          <Card>
            <CardHeader>
              <div className='flex items-center gap-2'>
                <ArrowUpRight className='text-muted-foreground h-4 w-4' />
                <CardTitle className='text-base'>{t('crmSync')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {contact.source?.startsWith('crm:') && (
                <p className='text-muted-foreground mb-3 text-xs'>
                  {t('importedFrom')}{' '}
                  <Badge variant='outline' className='text-[10px]'>
                    {contact.source.replace('crm:', '').toUpperCase()}
                  </Badge>
                </p>
              )}
              <CrmSyncActions contactId={contact.id} />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Activity */}
        <div className='space-y-6 lg:col-span-2'>
          {/* Notes */}
          <Card>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-base'>{t('notes')}</CardTitle>
                <Button
                  size='sm'
                  className='gap-1'
                  onClick={() => setNoteModalOpen(true)}
                >
                  <Plus className='h-4 w-4' /> {t('addNote')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className='max-h-[400px] space-y-3 overflow-y-auto pr-1'>
                {contact.notes.length > 0 ? (
                  contact.notes.map((note) => (
                    <div
                      key={note.id}
                      className='bg-muted/50 flex items-start justify-between rounded-lg p-3'
                    >
                      <div className='flex-1'>
                        <p className='text-sm whitespace-pre-wrap'>
                          {note.content}
                        </p>
                        <p className='text-muted-foreground mt-1.5 text-xs'>
                          {new Date(note.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size='icon'
                        variant='ghost'
                        className='ml-2 shrink-0'
                        onClick={() =>
                          setDeleteModal({ open: true, noteId: note.id })
                        }
                      >
                        <Trash className='text-muted-foreground h-4 w-4 hover:text-red-600' />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className='text-muted-foreground py-4 text-center text-sm'>
                    No notes yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Call History */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>{t('recentCalls')}</CardTitle>
            </CardHeader>
            <CardContent>
              {contact.calls.length > 0 ? (
                <div className='space-y-2'>
                  {contact.calls.map((call) => (
                    <div
                      key={call.id}
                      className='bg-muted/50 flex items-center justify-between rounded-lg p-3'
                    >
                      <div className='flex items-center gap-3'>
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            call.direction === 'outbound'
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-green-100 text-green-600'
                          }`}
                        >
                          <PhoneCall className='h-4 w-4' />
                        </div>
                        <div>
                          <p className='text-sm font-medium'>
                            {call.direction === 'outbound'
                              ? t('outbound')
                              : t('inbound')}{' '}
                            Call
                          </p>
                          <p className='text-muted-foreground text-xs'>
                            {new Date(call.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className='flex items-center gap-3 text-sm'>
                        <Badge variant='outline' className='text-xs'>
                          {call.status || 'unknown'}
                        </Badge>
                        <span className='text-muted-foreground text-xs'>
                          {formatDuration(call.duration)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='text-muted-foreground py-4 text-center text-sm'>
                  {t('noCallsYet')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <CreateNoteModal
        open={noteModalOpen}
        onOpenChange={setNoteModalOpen}
        contactId={contact.id}
        onSave={() => {
          router.refresh();
          setNoteModalOpen(false);
        }}
      />

      <ManageContactTagsModal
        contactId={contact.id}
        open={tagsModalOpen}
        onOpenChange={setTagsModalOpen}
        onTagsUpdated={() => router.refresh()}
      />

      <AlertDialog
        open={deleteModal.open}
        onOpenChange={(open) => setDeleteModal({ open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteNote')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteNoteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              disabled={loading}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              {loading ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteContactModal}
        onOpenChange={setDeleteContactModal}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteContact')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteContactConfirm', { name: displayName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContact}
              disabled={loading}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              {loading ? t('deleting') : t('deleteContact')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
