'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { IconPlus } from '@tabler/icons-react';
import { Eye } from 'lucide-react';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { useBackofficeApi, type OfferListItem, type OfferStatus } from '../api';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { OfferStatusBadge } from './offer-bits';

const PAGE_SIZE = 25;

const STATUS_TABS: { value: OfferStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'ENDED', label: 'Ended' }
];

export function OffersTable() {
  const api = useBackofficeApi();
  const [status, setStatus] = useState<OfferStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OfferListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listOffers({
        status,
        search: search.trim() || undefined,
        page,
        pageSize: PAGE_SIZE
      });
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [api, status, search, page]);

  useEffect(() => {
    const id = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pendingTotal = items.reduce(
    (sum, offer) => sum + offer.pendingApproval,
    0
  );

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='space-y-1.5'>
              <CardTitle>Offers</CardTitle>
              <CardDescription>
                Promotions across every placement. An offer is configuration —
                eligibility, reward, action and copy all live on the row.
                {pendingTotal > 0 && (
                  <>
                    {' '}
                    <span className='text-amber-700 dark:text-amber-300'>
                      {pendingTotal} submission{pendingTotal === 1 ? '' : 's'}{' '}
                      awaiting review.
                    </span>
                  </>
                )}
              </CardDescription>
            </div>
            <Button size='sm' asChild>
              <Link href='/backoffice/offers/new'>
                <IconPlus className='size-4' />
                New offer
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <Tabs
              value={status}
              onValueChange={(value) => {
                setStatus(value as OfferStatus | 'all');
                setPage(1);
              }}
            >
              <TabsList>
                {STATUS_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder='Search by name or slug'
              className='h-9 w-full sm:w-64'
            />
          </div>

          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Placement</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className='text-right'>Participants</TableHead>
                  <TableHead className='text-right'>Completed</TableHead>
                  <TableHead className='text-right'>Rewards</TableHead>
                  <TableHead className='text-right'>Credits</TableHead>
                  <TableActionHead>
                    <span className='sr-only'>Actions</span>
                  </TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className='text-muted-foreground py-8 text-center text-sm'
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className='text-muted-foreground py-8 text-center text-sm'
                    >
                      No offers yet.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell>
                      <Link
                        href={`/backoffice/offers/${offer.id}`}
                        className='font-medium hover:underline'
                      >
                        {offer.internalName || offer.name}
                      </Link>
                      <p className='text-muted-foreground text-xs'>
                        {offer.slug}
                      </p>
                    </TableCell>
                    <TableCell>
                      <OfferStatusBadge status={offer.status} />
                      {offer.pendingApproval > 0 && (
                        <Badge
                          variant='outline'
                          className='mt-1 block w-fit text-amber-600'
                        >
                          {offer.pendingApproval} pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-xs'>{offer.placement}</TableCell>
                    <TableCell className='text-xs'>
                      {offer.audienceType}
                    </TableCell>
                    <TableCell className='text-xs'>
                      {formatDate(offer.startsAt)}
                    </TableCell>
                    <TableCell className='text-xs'>
                      {formatDate(offer.endsAt)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(offer.participants)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(offer.completed)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(offer.rewardsIssued)}
                    </TableCell>
                    <TableCell className='text-right'>
                      ${formatMoney(offer.creditsIssued)}
                    </TableCell>
                    <TableActionCell>
                      <TableRowActions
                        label='Open actions menu'
                        menuLabel='Actions'
                      >
                        <DropdownMenuItem asChild>
                          <Link href={`/backoffice/offers/${offer.id}`}>
                            <Eye className='size-4' />
                            View
                          </Link>
                        </DropdownMenuItem>
                      </TableRowActions>
                    </TableActionCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pages > 1 && (
            <div className='flex items-center justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className='text-muted-foreground text-xs'>
                Page {page} of {pages}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
