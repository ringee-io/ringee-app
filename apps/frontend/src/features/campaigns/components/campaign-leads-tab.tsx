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
import { Upload, UserPlus, Plus } from 'lucide-react';
import type {
  CampaignLead,
  CampaignLeadListResponse,
  CampaignStatus
} from '../types/campaign.types';
import { ImportLeadsModal } from './import-leads-modal';
import { AddLeadModal } from './add-lead-modal';

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
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'queued', label: 'Queued' },
  { value: 'dialing', label: 'Dialing' },
  { value: 'in_call', label: 'In call' },
  { value: 'dispositioned', label: 'Dispositioned' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'exhausted', label: 'Exhausted' },
  { value: 'dnc', label: 'DNC' }
];

interface Props {
  campaignId: string;
  campaignStatus: CampaignStatus;
  onLeadsChanged?: () => void;
}

export function CampaignLeadsTab({
  campaignId,
  campaignStatus,
  onLeadsChanged
}: Props) {
  const api = useApi();
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
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

  const totalPages = Math.ceil(total / limit);
  const canImport =
    campaignStatus === 'draft' ||
    campaignStatus === 'active' ||
    campaignStatus === 'paused';

  return (
    <>
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <CardTitle>Leads</CardTitle>
              <CardDescription>
                {total} total leads in this campaign
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
                  <SelectValue placeholder='All statuses' />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
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
                    Import CSV
                  </Button>
                  <Button size='sm' onClick={() => setAddOpen(true)}>
                    <Plus className='mr-2 h-4 w-4' />
                    Add Lead
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
                  ? 'No leads yet'
                  : 'No leads with this status'}
              </h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                {statusFilter === 'all'
                  ? 'Import a CSV file or add a lead manually to get started.'
                  : 'Try a different status filter.'}
              </p>
              {canImport && statusFilter === 'all' && (
                <div className='mt-4 flex gap-2'>
                  <Button variant='outline' onClick={() => setImportOpen(true)}>
                    <Upload className='mr-2 h-4 w-4' />
                    Import CSV
                  </Button>
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className='mr-2 h-4 w-4' />
                    Add Lead
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className='hidden md:table-cell'>
                      Company
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className='hidden sm:table-cell'>
                      Attempts
                    </TableHead>
                    <TableHead className='hidden lg:table-cell'>
                      Last Call
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className='font-medium'>
                        {lead.contact.name || '—'}
                      </TableCell>
                      <TableCell>{lead.contact.phoneNumber}</TableCell>
                      <TableCell className='hidden md:table-cell'>
                        {lead.contact.company || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant='secondary'
                          className={LEAD_STATUS_COLORS[lead.status] || ''}
                        >
                          {lead.status.replace(/_/g, ' ')}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className='mt-4 flex items-center justify-between'>
                  <p className='text-muted-foreground text-sm'>
                    Page {page} of {totalPages}
                  </p>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
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
