'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDebounce } from '@ringee/frontend-shared/hooks/use-debounce';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
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
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import {
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import {
  ExternalProfileMenuItems,
  hasExternalProfileLinks,
  type ExternalProfileLabels
} from '@ringee/frontend-shared/components/external-profile-links';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
import {
  Upload,
  UserPlus,
  Plus,
  Trash2,
  Loader2,
  Search,
  AlertTriangle,
  RotateCw,
  PlayCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { CallDetailDialog, ToneBadge, humanize } from '@/features/call-detail';
import type {
  CampaignLead,
  CampaignLeadListResponse,
  CampaignLeadStatus,
  CampaignStatus,
  Disposition
} from '../types/campaign.types';
import { DISPOSITION_TONE, LEAD_STATUS_CLASSES } from '../lib/lead-status';
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

function leadProfileUrls(lead: CampaignLead) {
  return {
    linkedinUrl: lead.contact.linkedinUrl,
    companyLinkedinUrl: lead.contact.affiliations?.[0]?.company.linkedinUrl,
    websiteUrl: lead.contact.websiteUrl
  };
}

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
  /** Leads per status (from the campaign summary), shown on the filter chips. */
  statusCounts?: { status: CampaignLeadStatus; count: number }[];
  onLeadsChanged?: () => void;
}

export function CampaignLeadsTab({
  campaignId,
  campaignStatus,
  canManage = false,
  statusCounts,
  onLeadsChanged
}: Props) {
  const api = useApi();
  const t = useTranslations('campaigns');
  const tContactActions = useTranslations('contacts.rowActions');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dispositionFilter, setDispositionFilter] = useState<string>('all');
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignLead | null>(null);
  const limit = 20;
  const debouncedSearch = useDebounce(search, 300);
  // Typing keeps requests in flight; only the newest one may write to state.
  const requestSeq = useRef(0);

  const hasFilters =
    statusFilter !== 'all' ||
    dispositionFilter !== 'all' ||
    debouncedSearch.trim() !== '';

  useEffect(() => {
    loadLeads();
  }, [campaignId, page, statusFilter, dispositionFilter, debouncedSearch]);

  // The disposition options are the campaign's own active dispositions.
  useEffect(() => {
    let cancelled = false;
    api
      .get<Disposition[]>(`/campaigns/${campaignId}/dispositions`)
      .then((data) => {
        if (!cancelled) setDispositions(data);
      })
      .catch(() => {
        // A missing disposition list just hides the filter.
      });
    return () => {
      cancelled = true;
    };
  }, [api, campaignId]);

  async function loadLeads() {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (dispositionFilter !== 'all') {
        params.dispositionCode = dispositionFilter;
      }
      const term = debouncedSearch.trim();
      if (term) params.search = term;

      const res = await api.get<CampaignLeadListResponse>(
        `/campaigns/${campaignId}/leads`,
        params
      );
      if (seq !== requestSeq.current) return;
      setLeads(res.data);
      setTotal(res.meta.total);
      setLoadFailed(false);
    } catch {
      if (seq === requestSeq.current) setLoadFailed(true);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
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
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || t('leads.toasts.removeError'));
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const countByStatus = statusCounts
    ? new Map(statusCounts.map((row) => [row.status as string, row.count]))
    : null;
  const totalLeads = statusCounts
    ? statusCounts.reduce((sum, row) => sum + row.count, 0)
    : null;
  const dispositionByCode = new Map(dispositions.map((d) => [d.code, d]));
  const canImport =
    canManage &&
    (campaignStatus === 'draft' ||
      campaignStatus === 'active' ||
      campaignStatus === 'paused');
  // Leads can be removed in any non-completed campaign — admins only.
  const canManageLeads = canManage && campaignStatus !== 'completed';
  const externalLinkLabels: ExternalProfileLabels = {
    group: tContactActions('linksGroup'),
    linkedinProfile: tContactActions('linkedinProfile'),
    linkedinCompany: tContactActions('linkedinCompany'),
    website: tContactActions('website')
  };
  const hasLeadRowActions =
    canManageLeads ||
    leads.some((lead) => hasExternalProfileLinks(leadProfileUrls(lead)));

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
            {canImport && (
              <div className='flex items-center gap-2'>
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
              </div>
            )}
          </div>
          {/* One click per status, with how many leads are in it. */}
          <div className='mt-4 flex flex-wrap gap-1.5'>
            {STATUS_FILTERS.filter(
              (s) =>
                s === 'all' ||
                s === statusFilter ||
                !countByStatus ||
                (countByStatus.get(s) ?? 0) > 0
            ).map((s) => {
              const count =
                s === 'all' ? totalLeads : (countByStatus?.get(s) ?? null);
              const selected = statusFilter === s;
              return (
                <Button
                  key={s}
                  type='button'
                  size='sm'
                  variant={selected ? 'default' : 'outline'}
                  aria-pressed={selected}
                  className='h-7 gap-1.5 rounded-full px-3 text-xs'
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(1);
                  }}
                >
                  {s === 'all' ? t('list.allStatuses') : t(`leadStatus.${s}`)}
                  {count !== null ? (
                    <span
                      className={cn(
                        'tabular-nums',
                        selected ? 'opacity-80' : 'text-muted-foreground'
                      )}
                    >
                      {format.number(count)}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>
          <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap'>
            <div className='relative min-w-[200px] flex-1'>
              <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('leads.filters.searchPlaceholder')}
                aria-label={t('leads.filters.searchPlaceholder')}
                className='pl-9'
              />
            </div>
            {dispositions.length > 0 && (
              <Select
                value={dispositionFilter}
                onValueChange={(v) => {
                  setDispositionFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className='w-full sm:w-[180px]'
                  aria-label={t('leads.filters.allDispositions')}
                >
                  <SelectValue
                    placeholder={t('leads.filters.allDispositions')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>
                    {t('leads.filters.allDispositions')}
                  </SelectItem>
                  {dispositions.map((d) => (
                    <SelectItem key={d.id} value={d.code}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && leads.length === 0 ? (
            <div className='space-y-2'>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : loadFailed && leads.length === 0 ? (
            <div className='flex flex-col items-center py-12 text-center'>
              <AlertTriangle className='mb-4 h-10 w-10 text-amber-500' />
              <h3 className='text-lg font-semibold'>
                {t('leads.error.title')}
              </h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t('leads.error.description')}
              </p>
              <Button
                variant='outline'
                className='mt-4'
                onClick={() => void loadLeads()}
              >
                <RotateCw className='mr-2 h-4 w-4' />
                {t('leads.error.retry')}
              </Button>
            </div>
          ) : leads.length === 0 ? (
            <div className='flex flex-col items-center py-12 text-center'>
              <UserPlus className='text-muted-foreground mb-4 h-12 w-12' />
              <h3 className='text-lg font-semibold'>
                {hasFilters
                  ? t('leads.empty.filteredTitle')
                  : t('leads.empty.title')}
              </h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                {hasFilters
                  ? t('leads.empty.filteredDescription')
                  : t('leads.empty.description')}
              </p>
              {canImport && !hasFilters && (
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
              {/* The dashboard scrolls inside a ScrollArea whose content box is
                  shrink-to-fit, so the table's own `overflow-x-auto` is not
                  enough: a wide table stretches the whole page instead of
                  scrolling. As a grid item the table gets an automatic minimum
                  size of 0, which keeps the overflow inside the table. */}
              <div
                className={cn(
                  'grid transition-opacity',
                  loading && 'pointer-events-none opacity-60'
                )}
                aria-busy={loading}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('leads.table.name')}</TableHead>
                      <TableHead>{t('leads.table.phone')}</TableHead>
                      <TableHead className='hidden md:table-cell'>
                        {t('leads.table.email')}
                      </TableHead>
                      <TableHead className='hidden md:table-cell'>
                        {t('leads.table.company')}
                      </TableHead>
                      <TableHead>{t('leads.table.status')}</TableHead>
                      <TableHead className='hidden sm:table-cell'>
                        {t('leads.table.lastOutcome')}
                      </TableHead>
                      <TableHead className='hidden sm:table-cell'>
                        {t('leads.table.attempts')}
                      </TableHead>
                      <TableHead className='hidden lg:table-cell'>
                        {t('leads.table.lastCall')}
                      </TableHead>
                      {hasLeadRowActions && (
                        <TableActionHead>
                          <span className='sr-only'>
                            {t('leads.table.actions')}
                          </span>
                        </TableActionHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className='font-medium'>
                          <Link
                            href={`/dashboard/contact/${lead.contactId}`}
                            target='_blank'
                            className='underline-offset-2 hover:underline'
                            title={t('leads.openContact')}
                          >
                            {lead.contact.name || '—'}
                          </Link>
                          <div className='text-muted-foreground text-xs'>
                            {[
                              lead.contact.jobTitle,
                              lead.contact.locationRegion
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </div>
                        </TableCell>
                        <TableCell>{lead.contact.phoneNumber}</TableCell>
                        <TableCell className='hidden md:table-cell'>
                          {lead.contact.email || '—'}
                        </TableCell>
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
                            variant='outline'
                            className={LEAD_STATUS_CLASSES[lead.status] || ''}
                          >
                            {t(`leadStatus.${lead.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className='hidden sm:table-cell'>
                          <LastOutcome
                            lead={lead}
                            disposition={
                              lead.lastAttempt?.dispositionCode
                                ? dispositionByCode.get(
                                    lead.lastAttempt.dispositionCode
                                  )
                                : undefined
                            }
                            noOutcomeLabel={t('leads.noOutcome')}
                            openLabel={t('leads.openCall')}
                            onOpenCall={setOpenCallId}
                          />
                        </TableCell>
                        <TableCell className='hidden sm:table-cell'>
                          {lead.attempts}
                        </TableCell>
                        <TableCell className='hidden lg:table-cell'>
                          {lead.lastCallAt
                            ? new Date(lead.lastCallAt).toLocaleString()
                            : '—'}
                        </TableCell>
                        {hasLeadRowActions && (
                          <TableActionCell>
                            {canManageLeads ||
                            hasExternalProfileLinks(leadProfileUrls(lead)) ? (
                              <TableRowActions
                                label={tCommon('openActions')}
                                menuLabel={t('leads.table.actions')}
                                loading={deletingId === lead.id}
                              >
                                <ExternalProfileMenuItems
                                  urls={leadProfileUrls(lead)}
                                  labels={externalLinkLabels}
                                  separator={false}
                                />
                                {canManageLeads ? (
                                  <>
                                    {hasExternalProfileLinks(
                                      leadProfileUrls(lead)
                                    ) ? (
                                      <DropdownMenuSeparator />
                                    ) : null}
                                    <DropdownMenuItem
                                      variant='destructive'
                                      disabled={IN_FLIGHT_STATUSES.includes(
                                        lead.status
                                      )}
                                      title={
                                        IN_FLIGHT_STATUSES.includes(lead.status)
                                          ? t('leads.inFlightHint')
                                          : undefined
                                      }
                                      onClick={() => setDeleteTarget(lead)}
                                    >
                                      <Trash2 className='h-4 w-4' />
                                      {t('leads.removeDialog.confirm')}
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </TableRowActions>
                            ) : null}
                          </TableActionCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leads.removeDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leads.removeDialog.description', {
                name: deleteTarget?.contact.name || t('leads.fallbackName'),
                phone: deleteTarget?.contact.phoneNumber || ''
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('leads.removeDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || deletingId === deleteTarget?.id}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void handleDelete(deleteTarget);
              }}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deletingId === deleteTarget?.id ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : null}
              {t('leads.removeDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <CallDetailDialog
        callId={openCallId}
        onClose={() => setOpenCallId(null)}
      />
    </>
  );
}

/**
 * How the lead's latest attempt ended, as the campaign labelled it. With a
 * recorded call behind it, the badge opens that call — recording, transcript
 * and all — without leaving the campaign.
 */
function LastOutcome({
  lead,
  disposition,
  noOutcomeLabel,
  openLabel,
  onOpenCall
}: {
  lead: CampaignLead;
  disposition?: Disposition;
  noOutcomeLabel: string;
  openLabel: string;
  onOpenCall: (callId: string) => void;
}) {
  const attempt = lead.lastAttempt;
  if (!attempt) return <span className='text-muted-foreground'>—</span>;

  const label = attempt.dispositionCode
    ? (disposition?.label ?? humanize(attempt.dispositionCode))
    : noOutcomeLabel;
  const badge = (
    <ToneBadge
      tone={disposition ? DISPOSITION_TONE[disposition.category] : 'neutral'}
      icon={attempt.callId ? PlayCircle : undefined}
    >
      {label}
    </ToneBadge>
  );

  if (!attempt.callId) return badge;
  const callId = attempt.callId;
  return (
    <button
      type='button'
      onClick={() => onOpenCall(callId)}
      title={openLabel}
      aria-label={`${label} — ${openLabel}`}
      className='rounded-lg transition-opacity hover:opacity-80'
    >
      {badge}
    </button>
  );
}
