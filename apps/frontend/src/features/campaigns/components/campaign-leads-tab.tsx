'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { Upload, UserPlus, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type {
  CampaignLead,
  CampaignLeadListResponse,
  CampaignLeadStatus,
  CampaignStatus
} from '../types/campaign.types';
import { ImportLeadsModal } from './import-leads-modal';
import { AddLeadModal } from './add-lead-modal';

// Leads actively in the dialer can't be removed — the backend rejects it and
// releasing one mid-call would corrupt dialer state.
const IN_FLIGHT_STATUSES: CampaignLeadStatus[] = [
  'locked',
  'dialing',
  'in_call',
  'wrap_up'
];

const LEAD_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  queued: 'bg-blue-100 text-blue-700',
  locked: 'bg-purple-100 text-purple-700',
  dialing: 'bg-orange-100 text-orange-700',
  in_call: 'bg-orange-100 text-orange-700',
  wrap_up: 'bg-yellow-100 text-yellow-700',
  dispositioned: 'bg-cyan-100 text-cyan-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  exhausted: 'bg-red-100 text-red-700',
  dnc: 'bg-red-100 text-red-700'
};

// Statuses worth surfacing as filters in the UI (terminal + common states).
// Labels come from `campaigns.leadStatus.*`; `all` is the unfiltered option.
const STATUS_FILTERS = [
  'all',
  'pending',
  'queued',
  'dialing',
  'in_call',
  'dispositioned',
  'scheduled',
  'completed',
  'exhausted',
  'dnc'
] as const;

interface Props {
  campaignId: string;
  campaignStatus: CampaignStatus;
  /** Org admins (and freelancers) can import/add/delete leads; members are read-only. */
  canManage?: boolean;
  onLeadsChanged?: () => void;
}

export function CampaignLeadsTab({
  campaignId,
  campaignStatus,
  canManage = false,
  onLeadsChanged
}: Props) {
  const api = useApi();
  const t = useTranslations('campaigns');
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    loadLeads();
  }, [campaignId, page, statusFilter]);

  async function loadLeads() {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (statusFilter !== 'all') params.status = statusFilter;

      const res = await api.get<CampaignLeadListResponse>(
        `/campaigns/${campaignId}/leads`,
        params
      );
      setLeads(res.data);
      setTotal(res.meta.total);
    } catch {
      // surfaced by api client / toast at call sites
    } finally {
      setLoading(false);
    }
  }

  function handleImported() {
    setPage(1);
    loadLeads();
    onLeadsChanged?.();
  }

  async function handleDelete(lead: CampaignLead) {
    setDeletingId(lead.id);
    try {
      await api.delete(`/campaigns/${campaignId}/leads/${lead.id}`);
      toast.success(
        t('leads.toasts.removed', {
          name: lead.contact.name || t('leads.fallbackName')
        })
      );
      // If we just emptied the current page, step back one so the user isn't
      // left staring at a blank table.
      if (leads.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await loadLeads();
      }
      onLeadsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || t('leads.toasts.removeError'));
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const canImport =
    canManage &&
    (campaignStatus === 'draft' ||
      campaignStatus === 'active' ||
      campaignStatus === 'paused');
  // Leads can be removed in any non-completed campaign — admins only.
  const canManageLeads = canManage && campaignStatus !== 'completed';

  return (
    <>
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <CardTitle>{t('leads.title')}</CardTitle>
              <CardDescription>
                {t('leads.total', { count: total })}
              </CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className='w-[160px]'>
                  <SelectValue placeholder={t('list.allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === 'all' ? t('list.allStatuses') : t(`leadStatus.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canImport && (
                <>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload className='mr-2 h-4 w-4' />
                    {t('leads.importCsv')}
                  </Button>
                  <Button size='sm' onClick={() => setAddOpen(true)}>
                    <Plus className='mr-2 h-4 w-4' />
                    {t('leads.addLead')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='space-y-2'>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className='flex flex-col items-center py-12 text-center'>
              <UserPlus className='text-muted-foreground mb-4 h-12 w-12' />
              <h3 className='text-lg font-semibold'>
                {statusFilter === 'all'
                  ? t('leads.empty.title')
                  : t('leads.empty.filteredTitle')}
              </h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                {statusFilter === 'all'
                  ? t('leads.empty.description')
                  : t('leads.empty.filteredDescription')}
              </p>
              {canImport && statusFilter === 'all' && (
                <div className='mt-4 flex gap-2'>
                  <Button variant='outline' onClick={() => setImportOpen(true)}>
                    <Upload className='mr-2 h-4 w-4' />
                    {t('leads.importCsv')}
                  </Button>
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className='mr-2 h-4 w-4' />
                    {t('leads.addLead')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('leads.table.name')}</TableHead>
                    <TableHead>{t('leads.table.phone')}</TableHead>
                    <TableHead className='hidden md:table-cell'>
                      {t('leads.table.company')}
                    </TableHead>
                    <TableHead>{t('leads.table.status')}</TableHead>
                    <TableHead className='hidden sm:table-cell'>
                      {t('leads.table.attempts')}
                    </TableHead>
                    <TableHead className='hidden lg:table-cell'>
                      {t('leads.table.lastCall')}
                    </TableHead>
                    {canManageLeads && (
                      <TableHead className='w-[60px] text-right'>
                        <span className='sr-only'>
                          {t('leads.table.actions')}
                        </span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className='font-medium'>
                        <div>{lead.contact.name || '—'}</div>
                        <div className='text-muted-foreground text-xs'>
                          {[lead.contact.jobTitle, lead.contact.locationRegion]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </TableCell>
                      <TableCell>{lead.contact.phoneNumber}</TableCell>
                      <TableCell className='hidden md:table-cell'>
                        <div>{lead.contact.company || '—'}</div>
                        <div className='text-muted-foreground text-xs'>
                          {[
                            lead.contact.companySize,
                            lead.contact.revenue,
                            lead.contact.websiteUrl
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant='secondary'
                          className={LEAD_STATUS_COLORS[lead.status] || ''}
                        >
                          {t(`leadStatus.${lead.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className='hidden sm:table-cell'>
                        {lead.attempts}
                      </TableCell>
                      <TableCell className='hidden lg:table-cell'>
                        {lead.lastCallAt
                          ? new Date(lead.lastCallAt).toLocaleString()
                          : '—'}
                      </TableCell>
                      {canManageLeads && (
                        <TableCell className='text-right'>
                          {IN_FLIGHT_STATUSES.includes(lead.status) ? (
                            <Button
                              variant='ghost'
                              size='icon'
                              disabled
                              title={t('leads.inFlightHint')}
                            >
                              <Trash2 className='text-muted-foreground/40 h-4 w-4' />
                            </Button>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  disabled={deletingId === lead.id}
                                  aria-label={t('leads.removeAria', {
                                    name:
                                      lead.contact.name ||
                                      t('leads.fallbackName')
                                  })}
                                >
                                  {deletingId === lead.id ? (
                                    <Loader2 className='h-4 w-4 animate-spin' />
                                  ) : (
                                    <Trash2 className='text-muted-foreground hover:text-destructive h-4 w-4' />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t('leads.removeDialog.title')}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('leads.removeDialog.description', {
                                      name:
                                        lead.contact.name ||
                                        t('leads.fallbackName'),
                                      phone: lead.contact.phoneNumber
                                    })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    {t('leads.removeDialog.cancel')}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(lead)}
                                    className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                  >
                                    {t('leads.removeDialog.confirm')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className='mt-4 flex items-center justify-between'>
                  <p className='text-muted-foreground text-sm'>
                    {t('list.page', { page, total: totalPages })}
                  </p>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('list.previous')}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      {t('list.next')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ImportLeadsModal
        campaignId={campaignId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />

      <AddLeadModal
        campaignId={campaignId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={handleImported}
      />
    </>
  );
}
