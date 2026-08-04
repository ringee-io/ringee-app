'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { DateRangeBar } from './date-range-bar';
import { CampaignStatusBadge } from './campaign-bits';
import {
  useBackofficeApi,
  type CampaignListItem,
  type CampaignListResult,
  type CampaignOrganizationOption,
  type CampaignSortKey,
  type CampaignStatusFilter
} from '../api';
import { rangeForPreset, type DateRange } from '../lib/date-presets';
import {
  errorMessage,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent
} from '../lib/format';

const PAGE_SIZE = 25;

const STATUS_TABS: { value: CampaignStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Done' }
];

const SORTS: { value: CampaignSortKey; label: string }[] = [
  { value: 'attempts', label: 'Most calls' },
  { value: 'cost', label: 'Highest cost' },
  { value: 'connected', label: 'Most connects' },
  { value: 'conversions', label: 'Most conversions' },
  { value: 'leads', label: 'Most leads' },
  { value: 'lastActivity', label: 'Last activity' },
  { value: 'created', label: 'Newest' },
  { value: 'name', label: 'Name (A-Z)' }
];

/** "none" is the sentinel the API uses for campaigns with no organization. */
const ORG_ALL = 'all';
const ORG_NONE = 'none';

function StatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className='gap-3 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='px-4 pb-0 sm:px-6 sm:pb-2'>
        <CardDescription className='text-xs sm:text-sm'>
          {label}
        </CardDescription>
        <CardTitle className='text-xl sm:text-2xl'>{value}</CardTitle>
        {hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
      </CardHeader>
    </Card>
  );
}

function OwnerCell({ item }: { item: CampaignListItem }) {
  return (
    <div className='min-w-0'>
      <p className='truncate text-sm'>{item.organizationName ?? 'Personal'}</p>
      <p className='text-muted-foreground truncate text-xs'>
        {item.ownerEmail || item.ownerName}
      </p>
    </div>
  );
}

export function CampaignsTable() {
  const api = useBackofficeApi();
  const router = useRouter();

  const [range, setRange] = useState<DateRange>(() => rangeForPreset('today'));
  const [status, setStatus] = useState<CampaignStatusFilter>('all');
  const [organizationId, setOrganizationId] = useState<string>(ORG_ALL);
  const [sort, setSort] = useState<CampaignSortKey>('attempts');
  const [onlyNew, setOnlyNew] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<CampaignListResult | null>(null);
  const [orgs, setOrgs] = useState<CampaignOrganizationOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    api
      .listCampaignOrganizations()
      .then((res) => {
        if (!cancelled) setOrgs(res);
      })
      .catch(() => {
        /* the filter just stays on "All" — not worth a toast */
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listCampaigns({
        start: range.start,
        end: range.end,
        search: search || undefined,
        status,
        organizationId,
        onlyNew: onlyNew || undefined,
        sort,
        page,
        pageSize: PAGE_SIZE
      });
      setData(res);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load campaigns'));
    } finally {
      setLoading(false);
    }
  }, [api, range, search, status, organizationId, onlyNew, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  const items = data?.items ?? [];
  const totals = data?.totals;
  const total = data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const resetPage = () => setPage(1);

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div>
        <h1 className='text-xl font-semibold sm:text-2xl'>Campaigns</h1>
        <p className='text-muted-foreground text-sm'>
          Outbound campaign activity across every account — volume, connect
          rate, conversions and spend.
        </p>
      </div>

      <DateRangeBar
        value={range}
        onChange={(r) => {
          setRange(r);
          resetPage();
        }}
      />

      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6'>
        <StatCard
          label='Campaigns'
          value={totals ? formatNumber(totals.campaigns) : '—'}
          hint={
            totals
              ? `${formatNumber(totals.activeCampaigns)} active`
              : undefined
          }
        />
        <StatCard
          label='New in range'
          value={totals ? formatNumber(totals.newCampaigns) : '—'}
        />
        <StatCard
          label='Calls'
          value={totals ? formatNumber(totals.attempts) : '—'}
          hint={
            totals ? `${formatNumber(totals.connected)} connected` : undefined
          }
        />
        <StatCard
          label='Contact rate'
          value={totals ? formatPercent(totals.contactRate) : '—'}
        />
        <StatCard
          label='Conversions'
          value={totals ? formatNumber(totals.conversions) : '—'}
          hint={
            totals
              ? formatPercent(totals.conversionRate) + ' of calls'
              : undefined
          }
        />
        <StatCard
          label='Cost'
          value={totals ? formatMoney(totals.cost) : '—'}
          hint={
            totals && totals.attempts
              ? `${formatMoney(totals.costPerAttempt)} / call`
              : undefined
          }
        />
      </div>

      <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
        <CardHeader className='flex flex-col gap-3 px-4 sm:px-6'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <CardTitle>
              {total > 0 ? `${formatNumber(total)} campaigns` : 'Campaigns'}
            </CardTitle>
            <Tabs
              className='w-full sm:w-auto'
              value={status}
              onValueChange={(v) => {
                setStatus(v as CampaignStatusFilter);
                resetPage();
              }}
            >
              <TabsList className='w-full sm:w-fit'>
                {STATUS_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
            <Input
              placeholder='Search campaign, org or owner…'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Select
              value={organizationId}
              onValueChange={(v) => {
                setOrganizationId(v);
                resetPage();
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Organization' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ORG_ALL}>All organizations</SelectItem>
                {orgs.map((o) => (
                  <SelectItem key={o.id ?? ORG_NONE} value={o.id ?? ORG_NONE}>
                    {o.name} ({formatNumber(o.campaigns)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as CampaignSortKey);
                resetPage();
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Sort' />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={onlyNew ? 'default' : 'outline'}
              onClick={() => {
                setOnlyNew((v) => !v);
                resetPage();
              }}
            >
              {onlyNew ? 'Showing new only' : 'Only new in range'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className='space-y-4 px-4 sm:px-6'>
          <div className='hidden xl:block'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Leads</TableHead>
                  <TableHead className='text-right'>Calls</TableHead>
                  <TableHead className='text-right'>Connected</TableHead>
                  <TableHead className='text-right'>Conv.</TableHead>
                  <TableHead className='text-right'>Talk</TableHead>
                  <TableHead className='text-right'>Cost</TableHead>
                  <TableHead className='text-right'>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className='text-muted-foreground py-8 text-center'
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className='text-muted-foreground py-8 text-center'
                    >
                      No campaigns match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow
                      key={item.id}
                      className='cursor-pointer'
                      onClick={() =>
                        router.push(`/backoffice/campaigns/${item.id}`)
                      }
                    >
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <span className='font-medium'>{item.name}</span>
                          {item.isNew && <Badge variant='secondary'>New</Badge>}
                        </div>
                        <span className='text-muted-foreground text-xs'>
                          {item.dialerMode}
                        </span>
                      </TableCell>
                      <TableCell>
                        <OwnerCell item={item} />
                      </TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(item.totalLeads)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(item.attempts)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(item.connected)}
                        <span className='text-muted-foreground block text-xs'>
                          {formatPercent(item.contactRate)}
                        </span>
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(item.conversions)}
                        <span className='text-muted-foreground block text-xs'>
                          {formatPercent(item.conversionRate)}
                        </span>
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatDuration(item.talkSec)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatMoney(item.cost)}
                      </TableCell>
                      <TableCell className='text-muted-foreground text-right text-xs'>
                        {formatDateTime(item.lastActivityAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className='divide-y xl:hidden'>
            {loading && items.length === 0 ? (
              <p className='text-muted-foreground py-8 text-center text-sm'>
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className='text-muted-foreground py-8 text-center text-sm'>
                No campaigns match these filters.
              </p>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={`/backoffice/campaigns/${item.id}`}
                  className='hover:bg-muted/50 focus-visible:ring-ring block rounded-md py-4 outline-none focus-visible:ring-2'
                >
                  <div className='flex min-w-0 items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>{item.name}</p>
                      <p className='text-muted-foreground truncate text-xs'>
                        {item.organizationName ?? 'Personal'} ·{' '}
                        {item.ownerEmail || item.ownerName}
                      </p>
                    </div>
                    <div className='flex shrink-0 flex-col items-end gap-1'>
                      <CampaignStatusBadge status={item.status} />
                      {item.isNew && <Badge variant='secondary'>New</Badge>}
                    </div>
                  </div>

                  <dl className='mt-3 grid grid-cols-3 gap-3 text-sm'>
                    <div>
                      <dt className='text-muted-foreground text-xs'>Calls</dt>
                      <dd>{formatNumber(item.attempts)}</dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground text-xs'>
                        Connected
                      </dt>
                      <dd>
                        {formatNumber(item.connected)}{' '}
                        <span className='text-muted-foreground text-xs'>
                          ({formatPercent(item.contactRate)})
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground text-xs'>Cost</dt>
                      <dd>{formatMoney(item.cost)}</dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground text-xs'>Leads</dt>
                      <dd>{formatNumber(item.totalLeads)}</dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground text-xs'>Conv.</dt>
                      <dd>{formatNumber(item.conversions)}</dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground text-xs'>Talk</dt>
                      <dd>{formatDuration(item.talkSec)}</dd>
                    </div>
                  </dl>

                  <p className='text-muted-foreground mt-3 text-xs'>
                    Last activity {formatDateTime(item.lastActivityAt)}
                  </p>
                </Link>
              ))
            )}
          </div>

          <div className='flex flex-wrap items-center justify-between gap-3'>
            <span className='text-muted-foreground text-sm'>
              Page {page} of {totalPages}
            </span>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
