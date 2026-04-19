'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ringee/frontend-shared/components/ui/card';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';

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
  source?: string | null;
  lastCallAt?: string | null;
  createdAt: string;
  updatedAt: string;
  phones: ContactPhone[];
  emails: ContactEmail[];
  affiliations: ContactAffiliation[];
  tags: ContactTag[];
  notes: ContactNote[];
  calls: ContactCall[];
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>, label: string, value?: string | null }) {
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

export default function ContactDetail({ contact }: { contact: ContactDetailData }) {
  const router = useRouter();
  const api = useApi();
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; noteId?: string }>({ open: false });
  const [deleteContactModal, setDeleteContactModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const quickDialerCall = useQuickDialerCall()

  const displayName = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
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
      toast.success('Contact deleted');
      router.push('/dashboard/contact');
    } catch {
      toast.error('Failed to delete contact');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='mx-auto w-full max-w-6xl space-y-6'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-4'>
          <Button variant='ghost' size='icon' onClick={() => router.push('/dashboard/contact')}>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <div className='bg-primary flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white'>
            {initial}
          </div>
          <div>
            <h1 className='text-2xl font-bold'>{displayName}</h1>
            <div className='text-muted-foreground flex items-center gap-2 text-sm'>
              {contact.jobTitle && <span>{contact.jobTitle}</span>}
              {contact.jobTitle && contact.company && <span>at</span>}
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
            Call
          </Button>
          <Link href={`/dashboard/contact/${contact.id}/edit`}>
            <Button variant='outline' size='sm'>
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </Button>
          </Link>
          <Button
            variant='outline'
            size='sm'
            className='text-red-600 hover:text-red-700'
            onClick={() => setDeleteContactModal(true)}
          >
            <Trash className='mr-2 h-4 w-4' />
            Delete
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        {/* Left Column - Contact Info */}
        <div className='space-y-6 lg:col-span-1'>
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className='space-y-1'>
              <InfoRow icon={Phone} label='Phone' value={contact.phoneNumber} />
              <InfoRow icon={Mail} label='Email' value={contact.email} />
              <InfoRow icon={Building2} label='Company' value={contact.company} />
              <InfoRow icon={Briefcase} label='Job Title' value={contact.jobTitle} />
              <InfoRow icon={Globe} label='Source' value={contact.source?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} />
              <InfoRow icon={Calendar} label='Created' value={new Date(contact.createdAt).toLocaleDateString()} />
              {contact.lastCallAt && (
                <InfoRow icon={Clock} label='Last Call' value={new Date(contact.lastCallAt).toLocaleString()} />
              )}
            </CardContent>
          </Card>

          {/* Additional Phones */}
          {contact.phones.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Phone Numbers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {contact.phones.map((p) => (
                    <div key={p.id} className='flex items-center justify-between text-sm'>
                      <div className='flex items-center gap-2'>
                        <Phone className='text-muted-foreground h-3.5 w-3.5' />
                        <span>{p.phone}</span>
                      </div>
                      <div className='flex items-center gap-1'>
                        {p.type && <Badge variant='outline' className='text-xs'>{p.type}</Badge>}
                        {p.isPrimary && <Badge className='text-xs'>Primary</Badge>}
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
                <CardTitle className='text-base'>Email Addresses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {contact.emails.map((e) => (
                    <div key={e.id} className='flex items-center justify-between text-sm'>
                      <div className='flex items-center gap-2'>
                        <Mail className='text-muted-foreground h-3.5 w-3.5' />
                        <span>{e.email}</span>
                      </div>
                      <div className='flex items-center gap-1'>
                        {e.type && <Badge variant='outline' className='text-xs'>{e.type}</Badge>}
                        {e.isPrimary && <Badge className='text-xs'>Primary</Badge>}
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
                <CardTitle className='text-base'>Companies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  {contact.affiliations.map((aff) => (
                    <div key={aff.id} className='flex items-start gap-3'>
                      <Building2 className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
                      <div>
                        <p className='text-sm font-medium'>{aff.company.name}</p>
                        {aff.role && <p className='text-muted-foreground text-xs'>{aff.role}</p>}
                        {aff.company.industry && (
                          <p className='text-muted-foreground text-xs'>{aff.company.industry}</p>
                        )}
                        {aff.isPrimary && <Badge className='mt-1 text-xs'>Primary</Badge>}
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
                <CardTitle className='text-base'>Tags</CardTitle>
                <Button size='sm' variant='ghost' onClick={() => setTagsModalOpen(true)}>
                  <Tag className='mr-1 h-3.5 w-3.5' /> Manage
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
                <p className='text-muted-foreground text-sm'>No tags</p>
              )}
            </CardContent>
          </Card>

          {/* CRM Actions */}
          <Card>
            <CardHeader>
              <div className='flex items-center gap-2'>
                <ArrowUpRight className='h-4 w-4 text-muted-foreground' />
                <CardTitle className='text-base'>CRM Sync</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {contact.source?.startsWith('crm:') && (
                <p className='text-muted-foreground mb-3 text-xs'>
                  Imported from <Badge variant='outline' className='text-[10px]'>{contact.source.replace('crm:', '').toUpperCase()}</Badge>
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
                <CardTitle className='text-base'>Notes</CardTitle>
                <Button size='sm' className='gap-1' onClick={() => setNoteModalOpen(true)}>
                  <Plus className='h-4 w-4' /> Add Note
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
                        <p className='text-sm whitespace-pre-wrap'>{note.content}</p>
                        <p className='text-muted-foreground mt-1.5 text-xs'>
                          {new Date(note.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size='icon'
                        variant='ghost'
                        className='ml-2 shrink-0'
                        onClick={() => setDeleteModal({ open: true, noteId: note.id })}
                      >
                        <Trash className='text-muted-foreground h-4 w-4 hover:text-red-600' />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className='text-muted-foreground py-4 text-center text-sm'>No notes yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Call History */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Recent Calls</CardTitle>
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
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          call.direction === 'outbound' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                        }`}>
                          <PhoneCall className='h-4 w-4' />
                        </div>
                        <div>
                          <p className='text-sm font-medium'>
                            {call.direction === 'outbound' ? 'Outbound' : 'Inbound'} Call
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
                <p className='text-muted-foreground py-4 text-center text-sm'>No calls yet</p>
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
            <AlertDialogTitle>Delete note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              disabled={loading}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              {loading ? 'Deleting...' : 'Delete'}
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
            <AlertDialogTitle>Delete contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {displayName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContact}
              disabled={loading}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              {loading ? 'Deleting...' : 'Delete Contact'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
